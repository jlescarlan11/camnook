import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPrivacyEmailResendClient,
  PRIVACY_FORWARD_PROVIDER_TIMEOUT_MS,
} from "./resend-client";

describe("privacy email Resend client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shares one bounded deadline across every provider request", async () => {
    const signal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(signal);
    const providerFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "provider-result" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", providerFetch);

    const client = createPrivacyEmailResendClient("re_test_api_key");
    await client.get("/emails/receiving/received-email-id");
    await client.get("/emails/receiving/received-email-id/attachments");
    await client.post(
      "/emails",
      { subject: "Synthetic forward" },
      { idempotencyKey: "privacy-forward-synthetic" },
    );

    expect(timeout).toHaveBeenCalledOnce();
    expect(timeout).toHaveBeenCalledWith(PRIVACY_FORWARD_PROVIDER_TIMEOUT_MS);
    expect(providerFetch).toHaveBeenCalledTimes(3);
    for (const call of providerFetch.mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({ signal }));
    }
  });
});
