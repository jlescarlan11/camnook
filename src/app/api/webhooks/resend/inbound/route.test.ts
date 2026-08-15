import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resendMocks = vi.hoisted(() => ({
  forward: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = { receiving: { forward: resendMocks.forward } };
    webhooks = { verify: resendMocks.verify };
  },
}));

import { POST } from "./route";

const originalEnvironment = {
  apiKey: process.env.RESEND_API_KEY,
  destination: process.env.PRIVACY_FORWARD_TO,
  webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
};

function receivedEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: "email.received",
    created_at: "2026-08-15T00:00:00.000Z",
    data: {
      attachments: [],
      bcc: [],
      cc: [],
      created_at: "2026-08-15T00:00:00.000Z",
      email_id: "received-email-id",
      from: "Renter <renter@example.com>",
      message_id: "message-id",
      received_for: ["privacy@camnook.shop"],
      subject: "Privacy request",
      to: ["privacy@camnook.shop"],
      ...overrides,
    },
  };
}

function signedRequest() {
  return new Request("https://camnook.test/api/webhooks/resend/inbound", {
    method: "POST",
    body: JSON.stringify({ private: "webhook payload" }),
    headers: {
      "content-type": "application/json",
      "svix-id": "webhook-delivery-id",
      "svix-signature": "v1,signature",
      "svix-timestamp": "1786752000",
    },
  });
}

describe("Resend inbound privacy email webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "re_test_api_key";
    process.env.PRIVACY_FORWARD_TO = "privacy-owner@example.com";
    process.env.RESEND_WEBHOOK_SECRET = "whsec_test_secret";
    resendMocks.verify.mockReturnValue(receivedEvent());
    resendMocks.forward.mockResolvedValue({ data: { id: "forwarded-email-id" }, error: null });
  });

  afterEach(() => {
    if (originalEnvironment.apiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalEnvironment.apiKey;

    if (originalEnvironment.destination === undefined) delete process.env.PRIVACY_FORWARD_TO;
    else process.env.PRIVACY_FORWARD_TO = originalEnvironment.destination;

    if (originalEnvironment.webhookSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    else process.env.RESEND_WEBHOOK_SECRET = originalEnvironment.webhookSecret;
  });

  it("fails closed when the forwarding configuration is incomplete", async () => {
    delete process.env.PRIVACY_FORWARD_TO;

    const response = await POST(signedRequest());

    expect(response.status).toBe(503);
    expect(resendMocks.verify).not.toHaveBeenCalled();
    expect(resendMocks.forward).not.toHaveBeenCalled();
  });

  it("rejects a destination that would create a forwarding loop", async () => {
    process.env.PRIVACY_FORWARD_TO = "privacy@camnook.shop";

    const response = await POST(signedRequest());

    expect(response.status).toBe(503);
    expect(resendMocks.verify).not.toHaveBeenCalled();
  });

  it("rejects missing webhook signature headers", async () => {
    const response = await POST(
      new Request("https://camnook.test/api/webhooks/resend/inbound", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(401);
    expect(resendMocks.verify).not.toHaveBeenCalled();
    expect(resendMocks.forward).not.toHaveBeenCalled();
  });

  it("verifies the untouched request body and rejects an invalid signature", async () => {
    resendMocks.verify.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    const response = await POST(signedRequest());

    expect(response.status).toBe(401);
    expect(resendMocks.verify).toHaveBeenCalledWith({
      payload: JSON.stringify({ private: "webhook payload" }),
      headers: {
        id: "webhook-delivery-id",
        signature: "v1,signature",
        timestamp: "1786752000",
      },
      webhookSecret: "whsec_test_secret",
    });
    expect(resendMocks.forward).not.toHaveBeenCalled();
  });

  it("acknowledges unrelated webhook event types without forwarding", async () => {
    resendMocks.verify.mockReturnValue({ type: "email.delivered", data: {} });

    const response = await POST(signedRequest());

    expect(response.status).toBe(204);
    expect(resendMocks.forward).not.toHaveBeenCalled();
  });

  it("ignores inbound email that was not addressed to the privacy mailbox", async () => {
    resendMocks.verify.mockReturnValue(
      receivedEvent({ received_for: ["support@camnook.shop"], to: ["support@camnook.shop"] }),
    );

    const response = await POST(signedRequest());

    expect(response.status).toBe(204);
    expect(resendMocks.forward).not.toHaveBeenCalled();
  });

  it("recognizes the privacy mailbox inside a display-name recipient", async () => {
    resendMocks.verify.mockReturnValue(
      receivedEvent({ received_for: [], to: ["CamNook Privacy <PRIVACY@CAMNOOK.SHOP>"] }),
    );

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    expect(resendMocks.forward).toHaveBeenCalledOnce();
  });

  it("drops mail sent from the privacy mailbox to prevent a forwarding loop", async () => {
    resendMocks.verify.mockReturnValue(
      receivedEvent({ from: "CamNook Privacy <privacy@camnook.shop>" }),
    );

    const response = await POST(signedRequest());

    expect(response.status).toBe(204);
    expect(resendMocks.forward).not.toHaveBeenCalled();
  });

  it("forwards only by provider email ID with a stable idempotency key", async () => {
    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    expect(resendMocks.forward).toHaveBeenCalledWith(
      {
        emailId: "received-email-id",
        to: "privacy-owner@example.com",
        from: "CamNook Privacy <privacy@camnook.shop>",
        passthrough: true,
      },
      { idempotencyKey: "privacy-forward-received-email-id" },
    );
    await expect(response.json()).resolves.toEqual({ accepted: true });
  });

  it("returns a retryable response without exposing private message data", async () => {
    resendMocks.forward.mockResolvedValue({ data: null, error: { message: "provider failure" } });

    const response = await POST(signedRequest());
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toBe(JSON.stringify({ accepted: false }));
    expect(body).not.toContain("renter@example.com");
    expect(body).not.toContain("received-email-id");
    expect(body).not.toContain("provider failure");
  });

  it("returns a retryable response when the provider request throws", async () => {
    resendMocks.forward.mockRejectedValue(new Error("network failure"));

    const response = await POST(signedRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ accepted: false });
  });
});
