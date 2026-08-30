import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/verification/cleanup", () => ({
  cleanupDueVerificationEvidence: vi.fn(),
}));

import { cleanupDueVerificationEvidence } from "@/features/verification/cleanup";

import { GET } from "./route";

const originalCronSecret = process.env.CRON_SECRET;

describe("verification evidence cleanup cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "verification-cleanup-test-secret";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  });

  it("rejects requests without the configured bearer secret", async () => {
    const response = await GET(
      new Request("https://camnook.test/api/internal/verification-evidence-cleanup"),
    );

    expect(response.status).toBe(401);
    expect(cleanupDueVerificationEvidence).not.toHaveBeenCalled();
  });

  it("returns only aggregate cleanup results to an authorized scheduler", async () => {
    vi.mocked(cleanupDueVerificationEvidence).mockResolvedValue({
      claimed: 3,
      cleaned: 3,
      expired: 2,
      failed: 0,
    });
    const response = await GET(
      new Request("https://camnook.test/api/internal/verification-evidence-cleanup", {
        headers: { authorization: "Bearer verification-cleanup-test-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      claimed: 3,
      cleaned: 3,
      expired: 2,
      failed: 0,
    });
  });

  it("logs only aggregate counts when cleanup remains partially retryable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(cleanupDueVerificationEvidence).mockResolvedValue({
      claimed: 3,
      cleaned: 2,
      expired: 1,
      failed: 1,
    });

    const response = await GET(
      new Request("https://camnook.test/api/internal/verification-evidence-cleanup", {
        headers: { authorization: "Bearer verification-cleanup-test-secret" },
      }),
    );

    expect(response.status).toBe(503);
    expect(consoleError).toHaveBeenCalledWith(
      "Verification evidence cleanup incomplete",
      { claimed: 3, cleaned: 2, expired: 1, failed: 1 },
    );
  });

  it("logs a detail-free failure marker when cleanup throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(cleanupDueVerificationEvidence).mockRejectedValue(
      new Error("private object path and owner detail"),
    );

    const response = await GET(
      new Request("https://camnook.test/api/internal/verification-evidence-cleanup", {
        headers: { authorization: "Bearer verification-cleanup-test-secret" },
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "cleanup_failed" });
    expect(consoleError).toHaveBeenCalledWith(
      "Verification evidence cleanup failed",
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "private object path",
    );
  });
});
