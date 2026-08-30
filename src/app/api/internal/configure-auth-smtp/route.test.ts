import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const originalKey = process.env.RESEND_API_KEY;

function request(token = "supabase-management-token-with-safe-length") {
  return new Request("https://camnook.test/api/internal/configure-auth-smtp", {
    headers: { authorization: `Bearer ${token}` },
    method: "POST",
  });
}

describe("Production Auth SMTP configuration", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_protected_resend_key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  });

  it("rejects requests without a management bearer token", async () => {
    const response = await POST(
      new Request("https://camnook.test/api/internal/configure-auth-smtp", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("uses the protected Resend credential and returns only safe state", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        Response.json({
          password_min_length: 15,
          smtp_admin_email: "auth@camnook.shop",
          smtp_host: "smtp.resend.com",
          smtp_port: "465",
          smtp_user: "resend",
        }),
      );
    vi.stubGlobal("fetch", fetch);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      customSmtpEnabled: true,
      leakedPasswordProtectionApplicable: false,
      passwordAuthenticationUsedByApplication: false,
      passwordMinimumLength: 15,
      provider: "resend",
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const [, init] of fetch.mock.calls) {
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
    const patchBody = JSON.parse(fetch.mock.calls[1][1].body as string);
    expect(patchBody.smtp_pass).toBe("re_protected_resend_key");
    expect(patchBody.smtp_port).toBe("465");
    expect(JSON.stringify(body)).not.toContain("re_protected");
  });

  it("does not forward provider error details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"message":"private provider detail"}', { status: 403 }),
      ),
    );

    const response = await POST(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("fails closed when a bounded management request times out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")),
    );

    const response = await POST(request());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "provider_unavailable",
    });
  });
});
