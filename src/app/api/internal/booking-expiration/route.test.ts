import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/contracts/expiry", () => ({ expireDueBookings: vi.fn() }));

import { expireDueBookings } from "@/features/contracts/expiry";

import { GET } from "./route";

const originalCronSecret = process.env.CRON_SECRET;

describe("booking expiration cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "booking-expiration-secret";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  });

  it("rejects a request without the timing-safe bearer secret", async () => {
    const response = await GET(
      new Request("https://camnook.test/api/internal/booking-expiration"),
    );

    expect(response.status).toBe(401);
    expect(expireDueBookings).not.toHaveBeenCalled();
  });

  it("returns only the aggregate expiration result", async () => {
    vi.mocked(expireDueBookings).mockResolvedValue({ expired: 2 });
    const response = await GET(
      new Request("https://camnook.test/api/internal/booking-expiration", {
        headers: { authorization: "Bearer booking-expiration-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ expired: 2 });
  });

  it("returns a constrained retryable failure and records server diagnostics", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(expireDueBookings).mockRejectedValue(
      new Error("private database detail"),
    );
    const response = await GET(
      new Request("https://camnook.test/api/internal/booking-expiration", {
        headers: { authorization: "Bearer booking-expiration-secret" },
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "booking_expiration_failed",
    });
    expect(consoleError).toHaveBeenCalledWith("Booking expiration failed");
  });
});
