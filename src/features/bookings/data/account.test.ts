import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  bookingPresentation,
  loadAccountOverview,
  loadBookingDetailContext,
  projectBooking,
  type SafeBookingRow,
} from "./account";

const baseRow: SafeBookingRow = {
  approval_deadline_at: null,
  approved_at: null,
  billable_days_snapshot: null,
  camera_id: "11111111-1111-4111-8111-111111111111",
  currency: "PHP",
  current_contract_version_id: null,
  daily_rate_snapshot: null,
  expected_location: "Quezon City",
  id: "22222222-2222-4222-8222-222222222222",
  intended_use: "Family event",
  meetup_snapshot_required: false,
  pickup_at: "2099-08-14T01:00:00Z",
  rental_amount: null,
  requested_at: "2026-08-13T01:00:00Z",
  return_at: "2099-08-15T01:00:00Z",
  security_deposit_amount: null,
  state: "FOR_REVIEW",
  total_due: null,
};

describe("renter booking projection", () => {
  it("loads the account overview through one owner-scoped snapshot RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        bookings: [{
          booking: baseRow,
          camera: { name: "Fujifilm X-T5", slug: "fujifilm-x-t5" },
          meetup: null,
        }],
        is_admin: true,
        profile: {
          account_status: "active",
          legal_name: "Maria Santos",
          phone: "+63 917 123 4567",
        },
      },
      error: null,
    });
    const context = {
      supabase: { schema: vi.fn(() => ({ rpc })) },
      user: { id: "user-1" },
    } as never;

    await expect(loadAccountOverview(context)).resolves.toMatchObject({
      bookings: [{ camera: { name: "Fujifilm X-T5" }, id: baseRow.id }],
      isAdmin: true,
      profile: { accountStatus: "active", legalName: "Maria Santos" },
      status: "success",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_my_account_overview");
  });

  it("rejects unexpected private fields in the account snapshot", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        bookings: [],
        is_admin: false,
        profile: null,
        private_operator_notes: "must not cross the boundary",
      },
      error: null,
    });

    await expect(
      loadAccountOverview({
        supabase: { schema: vi.fn(() => ({ rpc })) },
        user: { id: "user-1" },
      } as never),
    ).resolves.toEqual({ status: "error" });
  });

  it("loads the renter booking page through one owner-scoped snapshot RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        booking: baseRow,
        camera: { name: "Fujifilm X-T5", slug: "fujifilm-x-t5" },
        meetup: null,
        payment: {
          approval_deadline_at: null,
          booking_id: baseRow.id,
          booking_state: "FOR_REVIEW",
          can_submit: false,
          instructions: null,
          instructions_error: null,
          proof_policy: {
            allowed_media_types: ["image/jpeg", "image/png"],
            max_byte_size: 5 * 1024 * 1024,
            upload_intent_seconds: 900,
          },
          transaction: null,
        },
        pickup: {
          booking_id: baseRow.id,
          booking_state: "FOR_REVIEW",
          handoff: null,
          pickup_at: baseRow.pickup_at,
          return_at: baseRow.return_at,
          timeline: [],
        },
        resolution: {
          booking_id: baseRow.id,
          booking_state: "FOR_REVIEW",
          can_request_cancellation: true,
          cancellation: null,
          deposit: {
            deduction_amount: 0,
            held_amount: 0,
            refunded_amount: 0,
            remaining_refund_liability: 0,
            status: "none",
          },
          issue_decision: null,
          return_inspection: null,
        },
        versions: [],
      },
      error: null,
    });
    const context = {
      supabase: { schema: vi.fn(() => ({ rpc })) },
      user: { id: "user-1" },
    } as never;

    await expect(loadBookingDetailContext(context, baseRow.id)).resolves.toMatchObject({
      booking: { camera: { name: "Fujifilm X-T5" }, id: baseRow.id },
      payment: { booking_id: baseRow.id },
      pickup: { booking_id: baseRow.id },
      resolution: { booking_id: baseRow.id },
      status: "success",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_my_booking_detail_context", {
      p_booking_id: baseRow.id,
    });
  });

  it("rejects invalid booking references before the detail snapshot RPC", async () => {
    const rpc = vi.fn();

    await expect(
      loadBookingDetailContext(
        {
          supabase: { schema: vi.fn(() => ({ rpc })) },
          user: { id: "user-1" },
        } as never,
        "invalid",
      ),
    ).resolves.toEqual({ status: "missing" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("omits renter/operator fields and suppresses an unpopulated approval snapshot", () => {
    const unsafeRow = {
      ...baseRow,
      operator_notes: "never expose",
      renter_id: "another-user",
    };
    const result = projectBooking(
      unsafeRow,
      { name: "Fujifilm X-T5", slug: "fujifilm-x-t5" },
    );

    expect(result).toMatchObject({
      camera: { name: "Fujifilm X-T5", slug: "fujifilm-x-t5" },
      state: "FOR_REVIEW",
    });
    expect(result).not.toHaveProperty("approval");
    expect(result).not.toHaveProperty("renterId");
    expect(JSON.stringify(result)).not.toContain("never expose");
  });

  it("shows authoritative approval values only when the complete snapshot exists", () => {
    expect(
      projectBooking(
        {
          ...baseRow,
          approval_deadline_at: "2099-08-13T01:00:00Z",
          approved_at: "2099-08-12T01:00:00Z",
          billable_days_snapshot: 2,
          daily_rate_snapshot: 1500,
          rental_amount: 3000,
          security_deposit_amount: 5000,
          total_due: 8000,
        },
        null,
      ),
    ).toMatchObject({
      approval: {
        billableDays: 2,
        currency: "PHP",
        dailyRate: 1500,
        rentalAmount: 3000,
        securityDeposit: 5000,
        totalDue: 8000,
      },
      camera: { name: "Camera no longer publicly listed", slug: null },
    });
  });

  it("uses the same not-found presentation for a missing or RLS-hidden booking", () => {
    expect(bookingPresentation({ status: "missing" })).toEqual({
      kind: "not_found",
      message: "This booking could not be found.",
    });
    expect(bookingPresentation({ status: "missing" })).not.toHaveProperty(
      "owner",
    );
  });

  it("uses constrained recovery copy for a read failure", () => {
    const presentation = bookingPresentation({ status: "error" });
    expect(presentation).toEqual({
      kind: "error",
      message: "We couldn’t load this booking. Please try again from your account.",
    });
    expect(JSON.stringify(presentation)).not.toContain("Postgres");
  });
});
