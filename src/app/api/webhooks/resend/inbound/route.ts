import { createHash } from "node:crypto";

import { Resend } from "resend";
import { z } from "zod";

import { PRIVACY_EMAIL } from "@/features/privacy-email/constants";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

const forwardingConfigSchema = z.object({
  apiKey: z.string().trim().min(1),
  destination: z.string().trim().pipe(z.email()),
  webhookSecret: z.string().trim().min(1),
});
const forwardLedgerResponseSchema = z
  .object({
    status: z.enum(["claimed", "forwarded", "indeterminate", "retry"]),
  })
  .strict();

function normalizeMailbox(value: string) {
  const displayNameMatch = value.match(/<([^<>]+)>\s*$/);
  return (displayNameMatch?.[1] ?? value).trim().toLowerCase();
}

function getForwardingConfig() {
  const parsed = forwardingConfigSchema.safeParse({
    apiKey: process.env.RESEND_API_KEY,
    destination: process.env.PRIVACY_FORWARD_TO,
    webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
  });

  if (!parsed.success || normalizeMailbox(parsed.data.destination) === PRIVACY_EMAIL) {
    return null;
  }

  return parsed.data;
}

function wasSentToPrivacyAddress(addresses: string[]) {
  return addresses.some((address) => normalizeMailbox(address) === PRIVACY_EMAIL);
}

function retryableForwardingFailure() {
  console.error("Privacy email forwarding failed; Resend will retry the webhook.");
  return Response.json({ accepted: false }, { status: 503 });
}

function providerIdDigest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function claimPrivacyEmailForward(emailId: string, webhookId: string) {
  try {
    const admin = createSupabaseAdminClient();
    const emailDigest = providerIdDigest(emailId);
    const result = await admin.schema("api").rpc("claim_privacy_email_forward", {
      p_email_sha256_hex: emailDigest,
      p_webhook_sha256_hex: providerIdDigest(webhookId),
    });
    const parsed = forwardLedgerResponseSchema.safeParse(result.data);
    return result.error || !parsed.success
      ? null
      : { admin, emailDigest, status: parsed.data.status };
  } catch {
    return null;
  }
}

async function finalizePrivacyEmailForward(
  claim: NonNullable<Awaited<ReturnType<typeof claimPrivacyEmailForward>>>,
) {
  try {
    const result = await claim.admin
      .schema("api")
      .rpc("finalize_privacy_email_forward", {
        p_email_sha256_hex: claim.emailDigest,
      });
    const parsed = forwardLedgerResponseSchema.safeParse(result.data);
    return !result.error && parsed.success && parsed.data.status === "forwarded";
  } catch {
    return false;
  }
}

async function readBoundedWebhookBody(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > MAX_WEBHOOK_BODY_BYTES
  ) {
    return null;
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_WEBHOOK_BODY_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // The bounded rejection is still decisive if the client already closed.
      }
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

async function listForwardingAttachments(
  resend: Resend,
  emailId: string,
  expectedAttachments: Array<{ id: string }>,
) {
  if (expectedAttachments.length === 0) return [];
  const expectedIds = new Set(expectedAttachments.map((attachment) => attachment.id));
  if (expectedIds.size !== expectedAttachments.length) return null;

  const byId = new Map<
    string,
    {
      contentId?: string;
      contentType: string;
      filename?: string;
      path: string;
    }
  >();
  let after: string | undefined;
  const maxPages = Math.ceil(expectedIds.size / 100);

  for (let page = 0; page < maxPages; page += 1) {
    const result = await resend.emails.receiving.attachments.list({
      ...(after ? { after } : {}),
      emailId,
      limit: 100,
    });
    if (result.error || !result.data) return null;

    for (const attachment of result.data.data) {
      if (byId.has(attachment.id) || !expectedIds.has(attachment.id)) return null;
      byId.set(attachment.id, {
        contentType: attachment.content_type,
        path: attachment.download_url,
        ...(attachment.content_id ? { contentId: attachment.content_id } : {}),
        ...(attachment.filename ? { filename: attachment.filename } : {}),
      });
    }

    if (!result.data.has_more) {
      return byId.size === expectedIds.size
        ? expectedAttachments.map((attachment) => byId.get(attachment.id)!)
        : null;
    }
    after = result.data.data.at(-1)?.id;
    if (!after) return null;
  }

  return null;
}

export async function POST(request: Request) {
  const config = getForwardingConfig();

  if (!config) {
    return Response.json({ accepted: false }, { status: 503 });
  }

  const webhookId = request.headers.get("svix-id");
  const webhookTimestamp = request.headers.get("svix-timestamp");
  const webhookSignature = request.headers.get("svix-signature");

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    return Response.json({ accepted: false }, { status: 401 });
  }

  const rawPayload = await readBoundedWebhookBody(request);
  if (rawPayload === null) {
    return Response.json({ accepted: false }, { status: 413 });
  }
  const resend = new Resend(config.apiKey);

  let event;

  try {
    event = resend.webhooks.verify({
      payload: rawPayload,
      headers: {
        id: webhookId,
        timestamp: webhookTimestamp,
        signature: webhookSignature,
      },
      webhookSecret: config.webhookSecret,
    });
  } catch {
    return Response.json({ accepted: false }, { status: 401 });
  }

  if (event.type !== "email.received") {
    return new Response(null, { status: 204 });
  }

  const recipients = [
    ...event.data.to,
    ...event.data.cc,
    ...event.data.bcc,
    ...event.data.received_for,
  ];

  if (
    !wasSentToPrivacyAddress(recipients) ||
    normalizeMailbox(event.data.from) === PRIVACY_EMAIL
  ) {
    return new Response(null, { status: 204 });
  }

  const forwardClaim = await claimPrivacyEmailForward(
    event.data.email_id,
    webhookId,
  );
  if (!forwardClaim) return retryableForwardingFailure();
  if (forwardClaim.status === "forwarded") {
    return Response.json({ accepted: true });
  }
  if (forwardClaim.status === "indeterminate") {
    console.error("Privacy email forwarding requires operator reconciliation.");
    return Response.json({ accepted: false }, { status: 503 });
  }

  let receivedEmailResult;

  try {
    receivedEmailResult = await resend.emails.receiving.get(
      event.data.email_id,
      { html_format: "cid" },
    );
  } catch {
    return retryableForwardingFailure();
  }

  if (receivedEmailResult.error || !receivedEmailResult.data) {
    return retryableForwardingFailure();
  }

  const receivedEmail = receivedEmailResult.data;
  let attachments;

  try {
    attachments = await listForwardingAttachments(
      resend,
      event.data.email_id,
      receivedEmail.attachments,
    );
  } catch {
    return retryableForwardingFailure();
  }

  if (!attachments) {
    return retryableForwardingFailure();
  }
  const receivedReplyTargets = (receivedEmail.reply_to ?? []).filter(
    (address) => normalizeMailbox(address) !== PRIVACY_EMAIL,
  );

  let forwardingResult;

  try {
    forwardingResult = await resend.emails.send(
      {
        from: `CamNook Privacy <${PRIVACY_EMAIL}>`,
        to: config.destination,
        replyTo: receivedReplyTargets.length > 0 ? receivedReplyTargets : receivedEmail.from,
        subject: receivedEmail.subject,
        text: receivedEmail.text ?? "The original message did not include plain-text content.",
        ...(receivedEmail.html ? { html: receivedEmail.html } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
      },
      { idempotencyKey: `privacy-forward-${event.data.email_id}` },
    );
  } catch {
    return retryableForwardingFailure();
  }

  if (forwardingResult.error || !forwardingResult.data) {
    return retryableForwardingFailure();
  }
  if (!(await finalizePrivacyEmailForward(forwardClaim))) {
    return retryableForwardingFailure();
  }

  return Response.json({ accepted: true });
}
