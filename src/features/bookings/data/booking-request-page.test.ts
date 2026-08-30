import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadBookingRequestPageContext } from "./booking-request-page";

const CAMERA_ID = "11111111-1111-4111-8111-111111111111";
const values = {
  camera: CAMERA_ID,
  handoffTime: "09:00",
  pickupDate: "2099-09-07",
  policyVersion: "2",
  returnDate: "2099-09-09",
};

function bookingRequestClient(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return {
    context: {
      supabase: { schema: vi.fn(() => ({ rpc })) },
      user: { id: "22222222-2222-4222-8222-222222222222" },
    } as never,
    rpc,
  };
}

function snapshot() {
  return {
    camera: {
      id: CAMERA_ID,
      name: "Fujifilm X-T5",
      slug: "fujifilm-x-t5",
    },
    profile: {
      account_status: "active",
      legal_name: "Maria Santos",
      phone: "+63 917 123 4567",
    },
    quote: {
      billable_days: 2,
      camera_id: CAMERA_ID,
      currency: "PHP",
      daily_rate: 1500,
      pickup_at: "2099-09-07T01:00:00Z",
      rental_amount: 3000,
      return_at: "2099-09-09T01:00:00Z",
      security_deposit: 5000,
      total_due: 8000,
    },
  };
}

describe("booking request page context", () => {
  it("loads the selected camera, profile, and quote through one RPC", async () => {
    const fixture = bookingRequestClient(snapshot());

    await expect(
      loadBookingRequestPageContext(fixture.context, values),
    ).resolves.toEqual({
      camera: {
        id: CAMERA_ID,
        name: "Fujifilm X-T5",
        slug: "fujifilm-x-t5",
      },
      profile: {
        accountStatus: "active",
        legalName: "Maria Santos",
        phone: "+63 917 123 4567",
      },
      quote: {
        billableDays: 2,
        cameraId: CAMERA_ID,
        currency: "PHP",
        dailyRate: 1500,
        pickupAt: "2099-09-07T01:00:00Z",
        rentalAmount: 3000,
        returnAt: "2099-09-09T01:00:00Z",
        securityDeposit: 5000,
        totalDue: 8000,
      },
      status: "success",
    });
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(fixture.rpc).toHaveBeenCalledWith(
      "get_booking_request_page_context",
      {
        p_camera_id: CAMERA_ID,
        p_handoff_time: "09:00",
        p_pickup_date: "2099-09-07",
        p_policy_version: 2,
        p_return_date: "2099-09-09",
      },
    );
  });

  it("rejects malformed URL state without a database request", async () => {
    const fixture = bookingRequestClient(snapshot());

    await expect(loadBookingRequestPageContext(fixture.context, {
      ...values,
      policyVersion: "2.5",
    })).resolves.toEqual({ status: "error" });
    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it("fails closed on an unexpected private field or mismatched camera", async () => {
    const privateFixture = bookingRequestClient({
      ...snapshot(),
      camera: { ...snapshot().camera, serial_number: "PRIVATE-SERIAL" },
    });
    await expect(
      loadBookingRequestPageContext(privateFixture.context, values),
    ).resolves.toEqual({ status: "error" });

    const mismatchedFixture = bookingRequestClient({
      ...snapshot(),
      quote: {
        ...snapshot().quote,
        camera_id: "33333333-3333-4333-8333-333333333333",
      },
    });
    await expect(
      loadBookingRequestPageContext(mismatchedFixture.context, values),
    ).resolves.toEqual({ status: "error" });
  });
});
