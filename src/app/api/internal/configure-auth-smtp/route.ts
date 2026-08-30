import { NextResponse } from "next/server";

const PRODUCTION_PROJECT_REF = "iegcixcevvkryfwfotqz";
const AUTH_CONFIG_URL = `https://api.supabase.com/v1/projects/${PRODUCTION_PROJECT_REF}/config/auth`;
const AUTH_CONFIG_REQUEST_TIMEOUT_MS = 15_000;

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
  try {
    const updated = await fetch(AUTH_CONFIG_URL, {
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
    if (!updated.ok) {
      const unauthorized = updated.status === 401 || updated.status === 403;
      return NextResponse.json(
        {
          error: unauthorized
            ? "unauthorized"
            : "provider_rejected_configuration",
        },
        { status: unauthorized ? 401 : 502 },
      );
    }

    const verified = await fetch(AUTH_CONFIG_URL, {
      cache: "no-store",
      headers,
      method: "GET",
      signal: AbortSignal.timeout(AUTH_CONFIG_REQUEST_TIMEOUT_MS),
    });
    if (!verified.ok) {
      return NextResponse.json({ error: "configuration_not_confirmed" }, { status: 502 });
    }

    const config = (await verified.json()) as Record<string, unknown>;
    const summary = configurationSummary(config);
    if (!summary.customSmtpEnabled || summary.passwordMinimumLength !== 15) {
      return NextResponse.json({ error: "configuration_not_confirmed" }, { status: 502 });
    }
    return NextResponse.json(summary);
  } catch {
    return NextResponse.json({ error: "provider_unavailable" }, { status: 502 });
  }
}
