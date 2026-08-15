import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resendMocks = vi.hoisted(() => ({
  getAttachment: vi.fn(),
  getReceivedEmail: vi.fn(),
  send: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = {
      receiving: {
        attachments: { get: resendMocks.getAttachment },
        get: resendMocks.getReceivedEmail,
      },
      send: resendMocks.send,
    };
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

function receivedEmail(overrides: Record<string, unknown> = {}) {
  return {
    attachments: [],
    bcc: [],
    cc: [],
    created_at: "2026-08-15T00:00:00.000Z",
    from: "Renter <renter@example.com>",
    headers: {},
    html: "<p>Privacy request</p>",
    id: "received-email-id",
    message_id: "message-id",
    object: "email",
    received_for: ["privacy@camnook.shop"],
    reply_to: null,
    subject: "Privacy request",
    text: "Privacy request",
    to: ["privacy@camnook.shop"],
    ...overrides,
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
    resendMocks.getReceivedEmail.mockResolvedValue({ data: receivedEmail(), error: null });
    resendMocks.getAttachment.mockResolvedValue({ data: null, error: null });
    resendMocks.send.mockResolvedValue({ data: { id: "forwarded-email-id" }, error: null });
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
    expect(resendMocks.send).not.toHaveBeenCalled();
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
    expect(resendMocks.send).not.toHaveBeenCalled();
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
    expect(resendMocks.send).not.toHaveBeenCalled();
  });

  it("acknowledges unrelated webhook event types without forwarding", async () => {
    resendMocks.verify.mockReturnValue({ type: "email.delivered", data: {} });

    const response = await POST(signedRequest());

    expect(response.status).toBe(204);
    expect(resendMocks.send).not.toHaveBeenCalled();
  });

  it("ignores inbound email that was not addressed to the privacy mailbox", async () => {
    resendMocks.verify.mockReturnValue(
      receivedEvent({ received_for: ["support@camnook.shop"], to: ["support@camnook.shop"] }),
    );

    const response = await POST(signedRequest());

    expect(response.status).toBe(204);
    expect(resendMocks.send).not.toHaveBeenCalled();
  });

  it("recognizes the privacy mailbox inside a display-name recipient", async () => {
    resendMocks.verify.mockReturnValue(
      receivedEvent({ received_for: [], to: ["CamNook Privacy <PRIVACY@CAMNOOK.SHOP>"] }),
    );

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    expect(resendMocks.send).toHaveBeenCalledOnce();
  });

  it("drops mail sent from the privacy mailbox to prevent a forwarding loop", async () => {
    resendMocks.verify.mockReturnValue(
      receivedEvent({ from: "CamNook Privacy <privacy@camnook.shop>" }),
    );

    const response = await POST(signedRequest());

    expect(response.status).toBe(204);
    expect(resendMocks.send).not.toHaveBeenCalled();
  });

  it("retrieves the inbound content and makes replies target the original sender", async () => {
    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    expect(resendMocks.getReceivedEmail).toHaveBeenCalledWith(
      "received-email-id",
      { html_format: "cid" },
    );
    expect(resendMocks.send).toHaveBeenCalledWith(
      {
        from: "CamNook Privacy <privacy@camnook.shop>",
        html: "<p>Privacy request</p>",
        replyTo: "Renter <renter@example.com>",
        subject: "Privacy request",
        text: "Privacy request",
        to: "privacy-owner@example.com",
      },
      { idempotencyKey: "privacy-forward-received-email-id" },
    );
    await expect(response.json()).resolves.toEqual({ accepted: true });
  });

  it("honors a non-alias Reply-To supplied by the original sender", async () => {
    resendMocks.getReceivedEmail.mockResolvedValue({
      data: receivedEmail({ reply_to: ["Privacy agent <agent@example.com>"] }),
      error: null,
    });

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    expect(resendMocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: ["Privacy agent <agent@example.com>"] }),
      expect.anything(),
    );
  });

  it("ignores an alias Reply-To that would send a response back into the forwarder", async () => {
    resendMocks.getReceivedEmail.mockResolvedValue({
      data: receivedEmail({ reply_to: ["privacy@camnook.shop"] }),
      error: null,
    });

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    expect(resendMocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: "Renter <renter@example.com>" }),
      expect.anything(),
    );
  });

  it("preserves inbound attachments through short-lived provider URLs", async () => {
    resendMocks.getReceivedEmail.mockResolvedValue({
      data: receivedEmail({
        attachments: [{ id: "attachment-id", filename: "request.txt" }],
      }),
      error: null,
    });
    resendMocks.getAttachment.mockResolvedValue({
      data: {
        content_disposition: "attachment",
        content_id: "attachment-cid",
        content_type: "text/plain",
        download_url: "https://provider.test/signed-attachment",
        expires_at: "2026-08-15T00:05:00.000Z",
        filename: "request.txt",
        id: "attachment-id",
        object: "attachment",
        size: 12,
      },
      error: null,
    });

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    expect(resendMocks.getAttachment).toHaveBeenCalledWith({
      emailId: "received-email-id",
      id: "attachment-id",
    });
    expect(resendMocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [{
          contentId: "attachment-cid",
          contentType: "text/plain",
          filename: "request.txt",
          path: "https://provider.test/signed-attachment",
        }],
      }),
      expect.anything(),
    );
  });

  it("returns a retryable response when inbound content cannot be retrieved", async () => {
    resendMocks.getReceivedEmail.mockResolvedValue({
      data: null,
      error: { message: "provider failure" },
    });

    const response = await POST(signedRequest());

    expect(response.status).toBe(503);
    expect(resendMocks.send).not.toHaveBeenCalled();
  });

  it("returns a retryable response when an attachment cannot be retrieved", async () => {
    resendMocks.getReceivedEmail.mockResolvedValue({
      data: receivedEmail({ attachments: [{ id: "attachment-id" }] }),
      error: null,
    });
    resendMocks.getAttachment.mockResolvedValue({
      data: null,
      error: { message: "provider failure" },
    });

    const response = await POST(signedRequest());

    expect(response.status).toBe(503);
    expect(resendMocks.send).not.toHaveBeenCalled();
  });

  it("returns a retryable response without exposing private message data", async () => {
    resendMocks.send.mockResolvedValue({ data: null, error: { message: "provider failure" } });

    const response = await POST(signedRequest());
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toBe(JSON.stringify({ accepted: false }));
    expect(body).not.toContain("renter@example.com");
    expect(body).not.toContain("received-email-id");
    expect(body).not.toContain("provider failure");
  });

  it("returns a retryable response when the provider request throws", async () => {
    resendMocks.send.mockRejectedValue(new Error("network failure"));

    const response = await POST(signedRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ accepted: false });
  });
});
