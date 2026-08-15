import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  bookingPresentation,
  loadAccountData,
  loadBookingDetail,
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
  pickup_at: "2099-08-14T01:00:00Z",
  rental_amount: null,
  requested_at: "2026-08-13T01:00:00Z",
  return_at: "2099-08-15T01:00:00Z",
  security_deposit_amount: null,
  state: "FOR_REVIEW",
  total_due: null,
};

describe("renter booking projection", () => {
  it("selects only owner-safe profile and booking columns", async () => {
    const selections = new Map<string, string>();
    const filters: [string, string, unknown][] = [];
    const profileMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        account_status: "active",
        legal_name: "Maria Santos",
        phone: "+63 917 123 4567",
      },
      error: null,
    });
    const profileEq = vi.fn(() => ({ maybeSingle: profileMaybeSingle }));
    const bookingsOrder = vi.fn().mockResolvedValue({ data: [baseRow], error: null });
    const bookingsEq = vi.fn((column: string, value: unknown) => {
      filters.push(["bookings", column, value]);
      return { order: bookingsOrder };
    });
    const camerasIn = vi.fn().mockResolvedValue({
      data: [
        {
          id: baseRow.camera_id,
          name: "Fujifilm X-T5",
          slug: "fujifilm-x-t5",
        },
      ],
      error: null,
    });
    const client = {
      from: vi.fn((table: string) => ({
        select: vi.fn((columns: string) => {
          selections.set(table, columns);
          if (table === "profiles") return { eq: profileEq };
          if (table === "bookings") return { eq: bookingsEq };
          return { in: camerasIn };
        }),
      })),
    } as never;

    const result = await loadAccountData({
      supabase: client,
      user: { id: "user-1" },
    } as never);

    expect(result).toMatchObject({
      bookings: [{ camera: { name: "Fujifilm X-T5" } }],
      profile: { accountStatus: "active", legalName: "Maria Santos" },
      status: "success",
    });
    expect(selections.get("profiles")).toBe(
      "legal_name,phone,account_status",
    );
    expect(selections.get("bookings")).toBe(
      "id,camera_id,state,pickup_at,return_at,intended_use,expected_location,requested_at,approved_at,approval_deadline_at,billable_days_snapshot,daily_rate_snapshot,rental_amount,security_deposit_amount,total_due,currency,current_contract_version_id",
    );
    expect(selections.get("public_cameras")).toBe("id,name,slug");
    expect(selections.get("bookings")).not.toContain("renter_id");
    expect(selections.get("bookings")).not.toContain("operator_notes");
    expect(filters).toContainEqual(["bookings", "renter_id", "user-1"]);
  });

  it("returns the same missing result for an absent or owner-RLS-hidden booking", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const filters: [string, unknown][] = [];
    const builder = { eq: vi.fn(), maybeSingle };
    builder.eq.mockImplementation((column: string, value: unknown) => {
      filters.push([column, value]);
      return builder;
    });
    const client = {
      from: vi.fn(() => ({ select: vi.fn(() => builder) })),
    };

    await expect(
      loadBookingDetail(
        { supabase: client as never, user: { id: "user-1" } } as never,
        baseRow.id,
      ),
    ).resolves.toEqual({ status: "missing" });
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(filters).toEqual([
      ["id", baseRow.id],
      ["renter_id", "user-1"],
    ]);
  });

  it("loads an owner-scoped booking detail through an exact safe select", async () => {
    const selections = new Map<string, string>();
    const filters: [string, string, unknown][] = [];
    const bookingBuilder = { eq: vi.fn(), maybeSingle: vi.fn() };
    bookingBuilder.eq.mockImplementation((column: string, value: unknown) => {
      filters.push(["bookings", column, value]);
      return bookingBuilder;
    });
    bookingBuilder.maybeSingle.mockResolvedValue({ data: baseRow, error: null });
    const cameraBuilder = { eq: vi.fn(), maybeSingle: vi.fn() };
    cameraBuilder.eq.mockImplementation((column: string, value: unknown) => {
      filters.push(["public_cameras", column, value]);
      return cameraBuilder;
    });
    cameraBuilder.maybeSingle.mockResolvedValue({
      data: { name: "Fujifilm X-T5", slug: "fujifilm-x-t5" },
      error: null,
    });
    const client = {
      from: vi.fn((table: string) => ({
        select: vi.fn((columns: string) => {
          selections.set(table, columns);
          return table === "bookings" ? bookingBuilder : cameraBuilder;
        }),
      })),
    };

    const result = await loadBookingDetail(
      { supabase: client as never, user: { id: "user-1" } } as never,
      baseRow.id,
    );

    expect(result).toMatchObject({
      booking: { camera: { name: "Fujifilm X-T5" }, id: baseRow.id },
      status: "success",
    });
    expect(selections.get("bookings")).toBe(
      "id,camera_id,state,pickup_at,return_at,intended_use,expected_location,requested_at,approved_at,approval_deadline_at,billable_days_snapshot,daily_rate_snapshot,rental_amount,security_deposit_amount,total_due,currency,current_contract_version_id",
    );
    expect(filters).toContainEqual(["bookings", "id", baseRow.id]);
    expect(filters).toContainEqual(["bookings", "renter_id", "user-1"]);
  });

  it("returns an honest empty account and constrains account query failures", async () => {
    function accountClient(profileResult: unknown, bookingResult: unknown) {
      const profile = { maybeSingle: vi.fn().mockResolvedValue(profileResult) };
      const bookings = { order: vi.fn().mockResolvedValue(bookingResult) };
      return {
        from: vi.fn((table: string) => ({
          select: vi.fn(() =>
            table === "profiles"
              ? { eq: vi.fn(() => profile) }
              : { eq: vi.fn(() => bookings) },
          ),
        })),
      };
    }

    const emptyClient = accountClient(
      { data: null, error: null },
      { data: [], error: null },
    );
    await expect(
      loadAccountData({
        supabase: emptyClient as never,
        user: { id: "user-1" },
      } as never),
    ).resolves.toEqual({ bookings: [], profile: null, status: "success" });

    for (const [profileResult, bookingResult] of [
      [
        { data: null, error: { message: "profiles private detail" } },
        { data: [], error: null },
      ],
      [
        { data: null, error: null },
        { data: null, error: { message: "bookings private detail" } },
      ],
    ]) {
      const failedClient = accountClient(profileResult, bookingResult);
      const result = await loadAccountData({
        supabase: failedClient as never,
        user: { id: "user-1" },
      } as never);
      expect(result).toEqual({ status: "error" });
      expect(JSON.stringify(result)).not.toContain("private detail");
    }
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
