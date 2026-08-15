import { Resend } from "resend";
import { z } from "zod";

import { PRIVACY_EMAIL } from "@/features/privacy-email/constants";

export const dynamic = "force-dynamic";

const forwardingConfigSchema = z.object({
  apiKey: z.string().trim().min(1),
  destination: z.string().trim().pipe(z.email()),
  webhookSecret: z.string().trim().min(1),
});

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

  const rawPayload = await request.text();
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

  let forwardingResult;

  try {
    forwardingResult = await resend.emails.receiving.forward(
      {
        emailId: event.data.email_id,
        to: config.destination,
        from: `CamNook Privacy <${PRIVACY_EMAIL}>`,
        passthrough: true,
      },
      { idempotencyKey: `privacy-forward-${event.data.email_id}` },
    );
  } catch {
    console.error("Privacy email forwarding failed; Resend will retry the webhook.");
    return Response.json({ accepted: false }, { status: 503 });
  }

  if (forwardingResult.error || !forwardingResult.data) {
    console.error("Privacy email forwarding failed; Resend will retry the webhook.");
    return Response.json({ accepted: false }, { status: 503 });
  }

  return Response.json({ accepted: true });
}
