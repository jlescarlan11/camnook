import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const adminMocks = vi.hoisted(() => ({ rpc: vi.fn() }));
const resendMocks = vi.hoisted(() => ({
  getReceivedEmail: vi.fn(),
  listAttachments: vi.fn(),
  send: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    schema: vi.fn(() => ({ rpc: adminMocks.rpc })),
  })),
}));

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = {
      receiving: {
        attachments: { list: resendMocks.listAttachments },
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
    resendMocks.listAttachments.mockResolvedValue({
      data: { data: [], has_more: false, object: "list" },
      error: null,
    });
    resendMocks.send.mockResolvedValue({ data: { id: "forwarded-email-id" }, error: null });
    adminMocks.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_privacy_email_forward") {
        return { data: { status: "claimed" }, error: null };
      }
      if (name === "finalize_privacy_email_forward") {
        return { data: { status: "forwarded" }, error: null };
      }
      throw new Error(`unexpected RPC ${name}`);
    });
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

  it("rejects an oversized unauthenticated body before signature verification", async () => {
    const response = await POST(
      new Request("https://camnook.test/api/webhooks/resend/inbound", {
        method: "POST",
        body: "x".repeat(256 * 1024 + 1),
        headers: {
          "svix-id": "forged-delivery-id",
          "svix-signature": "v1,forged-signature",
          "svix-timestamp": "1786752000",
        },
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ accepted: false });
    expect(resendMocks.verify).not.toHaveBeenCalled();
    expect(resendMocks.send).not.toHaveBeenCalled();
  });

  it("bounds a chunked body even without a content-length header", async () => {
    const chunk = new Uint8Array(128 * 1024 + 1);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const response = await POST(
      new Request(
        "https://camnook.test/api/webhooks/resend/inbound",
        {
          body,
          duplex: "half",
          headers: {
            "svix-id": "forged-delivery-id",
            "svix-signature": "v1,forged-signature",
            "svix-timestamp": "1786752000",
          },
          method: "POST",
        } as RequestInit,
      ),
    );

    expect(response.status).toBe(413);
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
    expect(adminMocks.rpc).toHaveBeenCalledWith(
      "claim_privacy_email_forward",
      {
        p_email_sha256_hex: expect.stringMatching(/^[0-9a-f]{64}$/),
        p_webhook_sha256_hex: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    );
    expect(JSON.stringify(adminMocks.rpc.mock.calls)).not.toContain("received-email-id");
    expect(JSON.stringify(adminMocks.rpc.mock.calls)).not.toContain("webhook-delivery-id");
    expect(adminMocks.rpc).toHaveBeenCalledWith(
      "finalize_privacy_email_forward",
      { p_email_sha256_hex: expect.stringMatching(/^[0-9a-f]{64}$/) },
    );
    await expect(response.json()).resolves.toEqual({ accepted: true });
  });

  it("acknowledges a durable replay without retrieving or forwarding again", async () => {
    adminMocks.rpc.mockResolvedValue({
      data: { status: "forwarded" },
      error: null,
    });

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(resendMocks.getReceivedEmail).not.toHaveBeenCalled();
    expect(resendMocks.send).not.toHaveBeenCalled();
  });

  it("fails closed when an old unresolved forward requires reconciliation", async () => {
    adminMocks.rpc.mockResolvedValue({
      data: { status: "indeterminate" },
      error: null,
    });

    const response = await POST(signedRequest());

    expect(response.status).toBe(503);
    expect(resendMocks.getReceivedEmail).not.toHaveBeenCalled();
    expect(resendMocks.send).not.toHaveBeenCalled();
  });

  it("requests a safe retry when send succeeds but ledger finalization fails", async () => {
    adminMocks.rpc.mockImplementation(async (name: string) =>
      name === "claim_privacy_email_forward"
        ? { data: { status: "claimed" }, error: null }
        : { data: null, error: { message: "database unavailable" } },
    );

    const response = await POST(signedRequest());

    expect(response.status).toBe(503);
    expect(resendMocks.send).toHaveBeenCalledOnce();
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
    resendMocks.listAttachments.mockResolvedValue({
      data: {
        data: [{
          content_disposition: "attachment",
          content_id: "attachment-cid",
          content_type: "text/plain",
          download_url: "https://provider.test/signed-attachment",
          expires_at: "2026-08-15T00:05:00.000Z",
          filename: "request.txt",
          id: "attachment-id",
          size: 12,
        }],
        has_more: false,
        object: "list",
      },
      error: null,
    });

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    expect(resendMocks.listAttachments).toHaveBeenCalledWith({
      emailId: "received-email-id",
      limit: 100,
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

  it("lists attachment URLs in bounded pages instead of one request per attachment", async () => {
    const expectedAttachments = Array.from({ length: 101 }, (_, index) => ({
      filename: `request-${index}.txt`,
      id: `attachment-${index}`,
    }));
    const attachmentData = expectedAttachments.map((attachment) => ({
      content_disposition: "attachment",
      content_id: null,
      content_type: "text/plain",
      download_url: `https://provider.test/${attachment.id}`,
      expires_at: "2026-08-15T00:05:00.000Z",
      filename: attachment.filename,
      id: attachment.id,
      size: 12,
    }));
    resendMocks.getReceivedEmail.mockResolvedValue({
      data: receivedEmail({ attachments: expectedAttachments }),
      error: null,
    });
    resendMocks.listAttachments
      .mockResolvedValueOnce({
        data: { data: attachmentData.slice(0, 100), has_more: true, object: "list" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { data: attachmentData.slice(100), has_more: false, object: "list" },
        error: null,
      });

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    expect(resendMocks.listAttachments).toHaveBeenCalledTimes(2);
    expect(resendMocks.listAttachments).toHaveBeenNthCalledWith(1, {
      emailId: "received-email-id",
      limit: 100,
    });
    expect(resendMocks.listAttachments).toHaveBeenNthCalledWith(2, {
      after: "attachment-99",
      emailId: "received-email-id",
      limit: 100,
    });
    expect(resendMocks.send.mock.calls[0]?.[0].attachments).toHaveLength(101);
  });

  it("fails closed when the attachment list does not match the received email", async () => {
    resendMocks.getReceivedEmail.mockResolvedValue({
      data: receivedEmail({ attachments: [{ id: "expected-attachment" }] }),
      error: null,
    });
    resendMocks.listAttachments.mockResolvedValue({
      data: {
        data: [{
          content_disposition: "attachment",
          content_id: null,
          content_type: "text/plain",
          download_url: "https://provider.test/unexpected-attachment",
          expires_at: "2026-08-15T00:05:00.000Z",
          filename: "unexpected.txt",
          id: "unexpected-attachment",
          size: 12,
        }],
        has_more: false,
        object: "list",
      },
      error: null,
    });

    const response = await POST(signedRequest());

    expect(response.status).toBe(503);
    expect(resendMocks.send).not.toHaveBeenCalled();
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
    resendMocks.listAttachments.mockResolvedValue({
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
