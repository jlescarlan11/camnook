import { NextResponse } from "next/server";

const PRODUCTION_PROJECT_REF = "iegcixcevvkryfwfotqz";
const AUTH_CONFIG_URL = `https://api.supabase.com/v1/projects/${PRODUCTION_PROJECT_REF}/config/auth`;
const AUTH_CONFIG_REQUEST_TIMEOUT_MS = 15_000;
const MAX_AUTH_CONFIG_RESPONSE_BYTES = 64 * 1024;

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token.length >= 20 ? token : null;
}

function managementHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function configurationSummary(config: Record<string, unknown>) {
  return {
    customSmtpEnabled:
      config.smtp_admin_email === "auth@camnook.shop" &&
      config.smtp_host === "smtp.resend.com" &&
      String(config.smtp_port) === "465" &&
      config.smtp_user === "resend",
    leakedPasswordProtectionApplicable: false,
    passwordAuthenticationUsedByApplication: false,
    passwordMinimumLength:
      typeof config.password_min_length === "number"
        ? config.password_min_length
        : null,
    provider: "resend",
  };
}

async function readBoundedConfiguration(response: Response) {
  if (!response.body) throw new Error("configuration response body unavailable");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_AUTH_CONFIG_RESPONSE_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // The response limit remains decisive if the provider already closed.
      }
      throw new Error("configuration response too large");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const parsed = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(body),
  ) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("configuration response malformed");
  }
  return parsed as Record<string, unknown>;
}

async function readVerifiedConfiguration(headers: Record<string, string>) {
  const verified = await fetch(AUTH_CONFIG_URL, {
    cache: "no-store",
    headers,
    method: "GET",
    signal: AbortSignal.timeout(AUTH_CONFIG_REQUEST_TIMEOUT_MS),
  });
  if (!verified.ok) return null;

  const config = await readBoundedConfiguration(verified);
  const summary = configurationSummary(config);
  const confirmed =
    summary.customSmtpEnabled &&
    summary.passwordMinimumLength === 15 &&
    config.external_email_enabled === true &&
    config.mailer_autoconfirm === false &&
    config.mailer_secure_email_change_enabled === true &&
    config.smtp_sender_name === "CamNook";
  return confirmed ? summary : null;
}

async function reconcileConfiguration(headers: Record<string, string>) {
  try {
    const summary = await readVerifiedConfiguration(headers);
    return summary
      ? NextResponse.json(summary)
      : NextResponse.json(
          { error: "configuration_not_confirmed" },
          { status: 502 },
        );
  } catch {
    return NextResponse.json(
      { error: "configuration_not_confirmed" },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey || !resendApiKey.startsWith("re_")) {
    return NextResponse.json({ error: "smtp_credential_unavailable" }, { status: 503 });
  }

  const headers = managementHeaders(token);
  let updated: Response;
  try {
    updated = await fetch(AUTH_CONFIG_URL, {
      body: JSON.stringify({
        external_email_enabled: true,
        mailer_autoconfirm: false,
        mailer_secure_email_change_enabled: true,
        password_min_length: 15,
        smtp_admin_email: "auth@camnook.shop",
        smtp_host: "smtp.resend.com",
        smtp_pass: resendApiKey,
        smtp_port: "465",
        smtp_sender_name: "CamNook",
        smtp_user: "resend",
      }),
      cache: "no-store",
      headers,
      method: "PATCH",
      signal: AbortSignal.timeout(AUTH_CONFIG_REQUEST_TIMEOUT_MS),
    });
  } catch {
    return reconcileConfiguration(headers);
  }

  if (updated.status === 401 || updated.status === 403) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!updated.ok) {
    if (updated.status === 429 || updated.status >= 500) {
      return reconcileConfiguration(headers);
    }
    return NextResponse.json(
      { error: "provider_rejected_configuration" },
      { status: 502 },
    );
  }

  return reconcileConfiguration(headers);
}
