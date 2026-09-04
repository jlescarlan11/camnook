import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  }),
}));
vi.mock("@/lib/auth/require-user", () => ({
  getAuthenticatedUser: vi.fn(),
  requireUser: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAuthenticatedUser, requireUser } from "@/lib/auth/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildMeetupBinding } from "@/features/meetups/binding";
import { mintRecommendationReference } from "@/features/meetups/reference";

import { saveProfile } from "./profile";
import { quoteBooking } from "./quote-booking";
import { requestBooking } from "./request-booking";

const CAMERA_ID = "11111111-1111-4111-8111-111111111111";
const BOOKING_ID = "22222222-2222-4222-8222-222222222222";

function fields(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([name, value]) => data.set(name, value));
  const hasSchedule = ["handoffTime", "pickupDate", "policyVersion", "returnDate"].some(
    (name) => data.has(name),
  );
  if (!hasSchedule) {
    data.set("handoffTime", "09:00");
    data.set("pickupDate", "2099-08-14");
    data.set("policyVersion", "3");
    data.set("returnDate", "2099-08-16");
  }
  if (!data.has("operationId")) {
    data.set("operationId", "33333333-3333-4333-8333-333333333333");
  }
  if (!data.has("meetupConfirmed")) data.set("meetupConfirmed", "true");
  if (!data.has("meetupReference")) data.set("meetupReference", "v2.test.reference");
  return data;
}

function legacyFields(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([name, value]) => data.set(name, value));
  data.set("operationId", "33333333-3333-4333-8333-333333333333");
  return data;
}

function rpcClient(rpc: ReturnType<typeof vi.fn>) {
  return { rpc, schema: vi.fn(() => ({ rpc })) };
}

function profileQuery(result: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from }, eq, from, maybeSingle, select };
}

describe("quoteBooking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects the legacy quote contract before creating a database client", async () => {
    await expect(
      quoteBooking(
        { status: "idle" },
        legacyFields({
          camera: CAMERA_ID,
          pickup: "2099-08-14T09:00",
          return: "2099-08-15T09:01",
        }),
      ),
    ).resolves.toMatchObject({
      error: "invalid_input",
      fieldErrors: {
        handoffTime: expect.any(String),
        pickupDate: expect.any(String),
        policyVersion: expect.any(String),
        returnDate: expect.any(String),
      },
      status: "error",
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("passes only validated schedule fields and camera ID to the authoritative quote RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          billable_days: 7,
          camera_id: CAMERA_ID,
          currency: "PHP",
          daily_rate: 1234.56,
          pickup_at: "2099-08-14T01:00:00+00:00",
          rental_amount: 77.77,
          return_at: "2099-08-15T01:01:00+00:00",
          security_deposit: 88.88,
          total_due: 99.99,
        },
      ],
      error: null,
    });
    const api = rpcClient(rpc);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(api as never);

    await expect(
      quoteBooking(
        { status: "idle" },
        fields({
          camera: CAMERA_ID,
          generation: "7",
          pickup: "2099-08-14T09:00",
          return: "2099-08-15T09:01",
        }),
      ),
    ).resolves.toEqual({
      inputKey:
        '["11111111-1111-4111-8111-111111111111","2099-08-14","2099-08-16","09:00","3"]',
      quote: {
        billableDays: 7,
        cameraId: CAMERA_ID,
        currency: "PHP",
        dailyRate: 1234.56,
        pickupAt: "2099-08-14T01:00:00+00:00",
        rentalAmount: 77.77,
        returnAt: "2099-08-15T01:01:00+00:00",
        securityDeposit: 88.88,
        totalDue: 99.99,
      },
      status: "success",
      submissionGeneration: 7,
      values: {
        camera: CAMERA_ID,
        handoffTime: "09:00",
        pickupDate: "2099-08-14",
        policyVersion: "3",
        returnDate: "2099-08-16",
      },
    });
    expect(rpc).toHaveBeenCalledWith("quote_booking_schedule", {
      p_camera_id: CAMERA_ID,
      p_handoff_time: "09:00",
      p_pickup_date: "2099-08-14",
      p_policy_version: 3,
      p_return_date: "2099-08-16",
    });
    expect(api.schema).toHaveBeenCalledWith("api");
  });

  it("rejects invalid input before creating a database client", async () => {
    await expect(
      quoteBooking(
        { status: "idle" },
        fields({ camera: "not-a-uuid", pickup: "", return: "bad" }),
      ),
    ).resolves.toMatchObject({
      error: "invalid_input",
      fieldErrors: {
        camera: "Choose a camera.",
      },
      status: "error",
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("passes only validated calendar fields to the schedule quote RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          billable_days: 2,
          camera_id: CAMERA_ID,
          currency: "PHP",
          daily_rate: 750,
          pickup_at: "2099-08-24T01:00:00+00:00",
          rental_amount: 1500,
          return_at: "2099-08-26T01:00:00+00:00",
          security_deposit: 3000,
          total_due: 4500,
        },
      ],
      error: null,
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      rpcClient(rpc) as never,
    );

    const result = await quoteBooking(
      { status: "idle" },
      fields({
        camera: CAMERA_ID,
        generation: "4",
        handoffTime: "09:00",
        pickupDate: "2099-08-24",
        policyVersion: "3",
        returnDate: "2099-08-26",
        totalDue: "1",
      }),
    );

    expect(result).toMatchObject({
      inputKey:
        '["11111111-1111-4111-8111-111111111111","2099-08-24","2099-08-26","09:00","3"]',
      status: "success",
      submissionGeneration: 4,
    });
    expect(rpc).toHaveBeenCalledWith("quote_booking_schedule", {
      p_camera_id: CAMERA_ID,
      p_handoff_time: "09:00",
      p_pickup_date: "2099-08-24",
      p_policy_version: 3,
      p_return_date: "2099-08-26",
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("totalDue");
  });

  it("fails closed for partial schedule input", async () => {
    await expect(
      quoteBooking(
        { status: "idle" },
        fields({
          camera: CAMERA_ID,
          handoffTime: "9am",
          pickupDate: "2099-02-30",
          policyVersion: "0",
          returnDate: "",
        }),
      ),
    ).resolves.toMatchObject({
      error: "invalid_input",
      fieldErrors: {
        handoffTime: expect.any(String),
        pickupDate: expect.any(String),
        policyVersion: expect.any(String),
        returnDate: expect.any(String),
      },
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it.each([
    ["40001", "schedule_changed"],
    ["23P01", "unavailable"],
  ] as const)("maps schedule quote failure %s to %s", async (code, category) => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code, message: "private schedule and block details" },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      rpcClient(rpc) as never,
    );

    const result = await quoteBooking(
      { status: "idle" },
      fields({
        camera: CAMERA_ID,
        handoffTime: "09:00",
        pickupDate: "2099-08-24",
        policyVersion: "3",
        returnDate: "2099-08-26",
      }),
    );

    expect(result).toMatchObject({ error: category, status: "error" });
    expect(JSON.stringify(result)).not.toContain("private schedule");
  });

  it.each([
    [{ code: "22023", message: "private camera details" }, "not_quotable"],
    [{ code: "08006", message: "database hostname" }, "retryable"],
  ] as const)("maps database failures to %s without exposing details", async (dbError, category) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: dbError });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(rpcClient(rpc) as never);

    const result = await quoteBooking(
      { status: "idle" },
      fields({
        camera: CAMERA_ID,
        pickup: "2099-08-14T09:00",
        return: "2099-08-15T09:00",
      }),
    );

    expect(result).toMatchObject({ error: category, status: "error" });
    expect(JSON.stringify(result)).not.toContain(dbError.message);
  });
});

describe("saveProfile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("trims valid renter profile fields and sends only the two RPC parameters", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { account_status: "active" }, error: null });
    const api = rpcClient(rpc);
    vi.mocked(requireUser).mockResolvedValue({
      supabase: api,
      user: { id: "user-1" },
    } as never);

    await expect(
      saveProfile(
        { status: "idle" },
        fields({ legalName: "  Maria Santos  ", phone: "  +63 917 123 4567  " }),
      ),
    ).resolves.toEqual({ status: "success" });
    expect(rpc).toHaveBeenCalledWith("ensure_profile", {
      p_legal_name: "Maria Santos",
      p_phone: "+63 917 123 4567",
    });
    expect(api.schema).toHaveBeenCalledWith("api");
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/account");
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/account/bookings/new");
  });

  it("rejects invalid fields before authentication or mutation", async () => {
    await expect(
      saveProfile(
        { status: "idle" },
        fields({ legalName: "x", phone: "123" }),
      ),
    ).resolves.toMatchObject({
      fieldErrors: {
        legalName: "Enter your legal name (2–160 characters).",
        phone: "Enter a phone number (7–32 characters).",
      },
      status: "error",
      values: { legalName: "x", phone: "123" },
    });
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("returns the suspended state from the one authoritative profile RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { account_status: "suspended" },
      error: null,
    });
    vi.mocked(requireUser).mockResolvedValue({
      supabase: rpcClient(rpc),
      user: { id: "user-1" },
    } as never);

    await expect(
      saveProfile(
        { status: "idle" },
        fields({ legalName: "Maria Santos", phone: "+63 917 123 4567" }),
      ),
    ).resolves.toMatchObject({ error: "suspended", status: "error" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("constrains a profile mutation failure without leaking provider details", async () => {
    const failure = {
      data: null,
      error: { code: "XX000", message: "ensure_profile internals" },
    };
    const rpc = vi.fn().mockResolvedValue(failure);
    vi.mocked(requireUser).mockResolvedValue({
      supabase: rpcClient(rpc),
      user: { id: "user-1" },
    } as never);

    const result = await saveProfile(
      { status: "idle" },
      fields({ legalName: "Maria Santos", phone: "+63 917 123 4567" }),
    );

    expect(result).toEqual({
      error: "save_failed",
      status: "error",
      values: {
        legalName: "Maria Santos",
        phone: "+63 917 123 4567",
      },
    });
    expect(JSON.stringify(result)).not.toContain(failure.error.message);
  });
});

describe("requestBooking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MEETUP_RECOMMENDATION_SECRET;
    delete process.env.GEOAPIFY_API_KEY;
    delete process.env.MEETUP_ALLOWED_CATEGORIES;
  });

  it("rejects the legacy request contract before authenticating or mutating", async () => {
    await expect(
      requestBooking(
        { status: "idle" },
        legacyFields({
          camera: CAMERA_ID,
          expectedLocation: "Quezon City",
          intendedUse: "Family event",
          pickup: "2099-08-14T09:00",
          return: "2099-08-15T09:00",
        }),
      ),
    ).resolves.toMatchObject({
      error: "invalid_input",
      fieldErrors: {
        handoffTime: expect.any(String),
        pickupDate: expect.any(String),
        policyVersion: expect.any(String),
        returnDate: expect.any(String),
      },
      status: "error",
    });
    expect(getAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("fails closed when a bound meetup reference cannot be verified", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: BOOKING_ID, error: null });
    const active = profileQuery({ data: { account_status: "active" }, error: null });
    const api = rpcClient(rpc);
    const supabase = { ...active.client, ...api } as never;
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      supabase,
      user: { id: "user-1" },
    } as never);

    await expect(
      requestBooking(
        { status: "idle" },
        fields({
          camera: CAMERA_ID,
          expectedLocation: "  Quezon City  ",
          intendedUse: "  Family event  ",
          pickup: "2099-08-14T09:00",
          return: "2099-08-15T09:00",
          renterId: "attacker",
          totalDue: "1",
          state: "CONFIRMED",
        }),
      ),
    ).resolves.toMatchObject({ error: "request_failed", status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns field errors without authenticating or mutating invalid input", async () => {
    await expect(
      requestBooking(
        { status: "idle" },
        fields({
          camera: "bad",
          expectedLocation: "x",
          intendedUse: "",
          pickup: "",
          return: "",
        }),
      ),
    ).resolves.toMatchObject({
      error: "invalid_input",
      fieldErrors: {
        camera: "Choose a camera.",
        expectedLocation: "Describe the expected location (2–500 characters).",
        intendedUse: "Describe the intended use (2–1000 characters).",
      },
      status: "error",
      values: { expectedLocation: "x", intendedUse: "" },
    });
    expect(getAuthenticatedUser).not.toHaveBeenCalled();
  });

  it("does not use the schedule-only RPC when meetup configuration is unavailable", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: BOOKING_ID, error: null });
    const active = profileQuery({ data: { account_status: "active" }, error: null });
    const supabase = { ...active.client, ...rpcClient(rpc) } as never;
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      supabase,
      user: { id: "user-1" },
    } as never);

    await expect(
      requestBooking(
        { status: "idle" },
        fields({
          camera: CAMERA_ID,
          expectedLocation: "Cebu City",
          handoffTime: "09:00",
          intendedUse: "Family event",
          pickupDate: "2099-08-24",
          policyVersion: "3",
          returnDate: "2099-08-26",
        }),
      ),
    ).resolves.toMatchObject({ error: "request_failed", status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires a confirmed bound meetup and submits only decrypted server claims through the service RPC", async () => {
    process.env.GEOAPIFY_API_KEY = "provider-development-key";
    process.env.MEETUP_ALLOWED_CATEGORIES = "commercial.shopping_mall";
    process.env.MEETUP_RECOMMENDATION_SECRET =
      "server-only-meetup-reference-secret-value";
    const active = profileQuery({ data: { account_status: "active" }, error: null });
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      supabase: active.client,
      user: { id: "user-1" },
    } as never);
    const adminRpc = vi.fn().mockResolvedValue({ data: BOOKING_ID, error: null });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      rpcClient(adminRpc) as never,
    );
    const binding = buildMeetupBinding({
      cameraId: CAMERA_ID,
      configVersion: "geoapify-v1",
      handoffTime: "09:00",
      pickupDate: "2099-08-24",
      policyVersion: 3,
      renterId: "user-1",
      returnDate: "2099-08-26",
      routingPolicyVersion: "mapbox-matrix-v1",
    });
    const reference = mintRecommendationReference(
      {
        address: "Cardinal Rosales Avenue, Cebu City",
        binding,
        city: "Cebu City",
        configVersion: "geoapify-v1",
        expiresAt: "2099-08-24T00:00:00.000Z",
        latitude: 10.317,
        longitude: 123.905,
        name: "Ayala Center Cebu",
        renterCity: {
          label: "Mandaue City",
        },
        routingPolicyVersion: "mapbox-matrix-v1",
      },
      process.env.MEETUP_RECOMMENDATION_SECRET,
    );

    await expect(
      requestBooking(
        { status: "idle" },
        fields({
          camera: CAMERA_ID,
          expectedLocation: "Cebu City",
          handoffTime: "09:00",
          intendedUse: "Family event",
          meetupConfirmed: "true",
          meetupReference: reference,
          pickupDate: "2099-08-24",
          policyVersion: "3",
          returnDate: "2099-08-26",
          venueName: "attacker override",
        }),
      ),
    ).rejects.toThrow(`redirect:/account/bookings/${BOOKING_ID}?requested=1`);
    expect(adminRpc).toHaveBeenCalledWith(
      "request_booking_schedule_with_meetup_v2_idempotent",
      {
        p_camera_id: CAMERA_ID,
        p_expected_location: "Cebu City",
        p_handoff_time: "09:00",
        p_intended_use: "Family event",
        p_operation_id: "33333333-3333-4333-8333-333333333333",
        p_pickup_date: "2099-08-24",
        p_policy_version: 3,
        p_meetup_plan: {
          kind: "public_venue",
          provider: "geoapify",
          provider_config_version: "geoapify-v1",
          renter_city_label: "Mandaue City",
          venue_address: "Cardinal Rosales Avenue, Cebu City",
          venue_city: "Cebu City",
          venue_latitude: 10.317,
          venue_longitude: 123.905,
          venue_name: "Ayala Center Cebu",
        },
        p_renter_id: "user-1",
        p_return_date: "2099-08-26",
      },
    );
    expect(JSON.stringify(adminRpc.mock.calls)).not.toContain("attacker override");
  });

  it("cannot bypass meetup confirmation and rejects expired or tampered references before service mutation", async () => {
    process.env.GEOAPIFY_API_KEY = "provider-development-key";
    process.env.MEETUP_ALLOWED_CATEGORIES = "commercial.shopping_mall";
    process.env.MEETUP_RECOMMENDATION_SECRET =
      "server-only-meetup-reference-secret-value";
    const common = {
      camera: CAMERA_ID,
      expectedLocation: "Cebu City",
      handoffTime: "09:00",
      intendedUse: "Family event",
      pickupDate: "2099-08-24",
      policyVersion: "3",
      returnDate: "2099-08-26",
    };
    await expect(
      requestBooking({ status: "idle" }, fields({
        ...common,
        meetupConfirmed: "",
        meetupReference: "",
      })),
    ).resolves.toMatchObject({ error: "meetup_required", status: "error" });
    expect(getAuthenticatedUser).not.toHaveBeenCalled();

    const active = profileQuery({ data: { account_status: "active" }, error: null });
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      supabase: active.client,
      user: { id: "user-1" },
    } as never);
    await expect(
      requestBooking(
        { status: "idle" },
        fields({
          ...common,
          meetupConfirmed: "true",
          meetupReference: "v1.tampered.reference.value",
        }),
      ),
    ).resolves.toMatchObject({ error: "meetup_expired", status: "error" });
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();

    const staleRoutingReference = mintRecommendationReference(
      {
        address: "Cardinal Rosales Avenue, Cebu City",
        binding: buildMeetupBinding({
          cameraId: CAMERA_ID,
          configVersion: "geoapify-v1",
          handoffTime: "09:00",
          pickupDate: "2099-08-24",
          policyVersion: 3,
          renterId: "user-1",
          returnDate: "2099-08-26",
          routingPolicyVersion: "mapbox-matrix-v1",
        }),
        city: "Cebu City",
        configVersion: "geoapify-v1",
        expiresAt: "2099-08-24T00:00:00.000Z",
        latitude: 10.317,
        longitude: 123.905,
        name: "Ayala Center Cebu",
        renterCity: { label: "Mandaue City" },
        routingPolicyVersion: "mapbox-matrix-v1",
      },
      process.env.MEETUP_RECOMMENDATION_SECRET,
    );
    process.env.MEETUP_ROUTING_POLICY_VERSION = "mapbox-matrix-v2";
    await expect(
      requestBooking(
        { status: "idle" },
        fields({
          ...common,
          meetupConfirmed: "true",
          meetupReference: staleRoutingReference,
        }),
      ),
    ).resolves.toMatchObject({ error: "meetup_expired", status: "error" });
    delete process.env.MEETUP_ROUTING_POLICY_VERSION;
  });

  it("preserves the complete schedule through unauthenticated OTP routing", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    await expect(
      requestBooking(
        { status: "idle" },
        fields({
          camera: CAMERA_ID,
          expectedLocation: "Cebu City",
          handoffTime: "09:00",
          intendedUse: "Family event",
          meetupConfirmed: "true",
          meetupReference: "v1.pending.authentication",
          pickupDate: "2099-08-24",
          policyVersion: "3",
          returnDate: "2099-08-26",
        }),
      ),
    ).rejects.toThrow("redirect:/login?next=");
    const location = vi.mocked(redirect).mock.calls[0]?.[0];
    expect(decodeURIComponent(String(location))).toContain(
      "handoffTime=09%3A00&pickupDate=2099-08-24&policyVersion=3&returnDate=2099-08-26",
    );
  });

  it.each([
    ["P0001", "request_limit"],
    ["40001", "schedule_changed"],
    ["23P01", "unavailable"],
  ] as const)("maps schedule failure %s to %s without raw detail", async (code, category) => {
    process.env.GEOAPIFY_API_KEY = "provider-development-key";
    process.env.MEETUP_ALLOWED_CATEGORIES = "commercial.shopping_mall";
    process.env.MEETUP_RECOMMENDATION_SECRET =
      "server-only-meetup-reference-secret-value";
    const adminRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code, message: "private block and renter identity" },
    });
    const active = profileQuery({ data: { account_status: "active" }, error: null });
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      supabase: active.client,
      user: { id: "user-1" },
    } as never);
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      rpcClient(adminRpc) as never,
    );
    const reference = mintRecommendationReference(
      {
        address: "Cardinal Rosales Avenue, Cebu City",
        binding: buildMeetupBinding({
          cameraId: CAMERA_ID,
          configVersion: "geoapify-v1",
          handoffTime: "09:00",
          pickupDate: "2099-08-24",
          policyVersion: 3,
          renterId: "user-1",
          returnDate: "2099-08-26",
          routingPolicyVersion: "mapbox-matrix-v1",
        }),
        city: "Cebu City",
        configVersion: "geoapify-v1",
        expiresAt: "2099-08-24T00:00:00.000Z",
        latitude: 10.317,
        longitude: 123.905,
        name: "Ayala Center Cebu",
        renterCity: { label: "Mandaue City" },
        routingPolicyVersion: "mapbox-matrix-v1",
      },
      process.env.MEETUP_RECOMMENDATION_SECRET,
    );

    const result = await requestBooking(
      { status: "idle" },
      fields({
        camera: CAMERA_ID,
        expectedLocation: "Cebu City",
        handoffTime: "09:00",
        intendedUse: "Family event",
        meetupReference: reference,
        pickupDate: "2099-08-24",
        policyVersion: "3",
        returnDate: "2099-08-26",
      }),
    );

    expect(result).toMatchObject({ error: category, status: "error" });
    expect(JSON.stringify(result)).not.toContain("private block");
  });

  it("routes an unauthenticated direct action call through public registration", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);

    await expect(
      requestBooking(
        { status: "idle" },
        fields({
          camera: CAMERA_ID,
          expectedLocation: "Quezon City",
          intendedUse: "Family event",
          pickup: "2099-08-14T09:00",
          return: "2099-08-15T09:00",
        }),
      ),
    ).rejects.toThrow("redirect:/login?next=");
    expect(vi.mocked(redirect)).toHaveBeenCalledWith(
      "/login?next=%2Faccount%2Fbookings%2Fnew%3Fcamera%3D11111111-1111-4111-8111-111111111111%26handoffTime%3D09%253A00%26pickupDate%3D2099-08-14%26policyVersion%3D3%26returnDate%3D2099-08-16",
    );
  });

  it.each([
    ["booking_profile_required", "profile_required"],
    ["booking_profile_suspended", "suspended"],
  ] as const)("maps database profile precondition %s to %s", async (message, error) => {
    process.env.GEOAPIFY_API_KEY = "provider-development-key";
    process.env.MEETUP_ALLOWED_CATEGORIES = "commercial.shopping_mall";
    process.env.MEETUP_RECOMMENDATION_SECRET =
      "server-only-meetup-reference-secret-value";
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      supabase: {},
      user: { id: "user-1" },
    } as never);
    const adminRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message },
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(
      rpcClient(adminRpc) as never,
    );
    const reference = mintRecommendationReference(
      {
        address: "Cardinal Rosales Avenue, Cebu City",
        binding: buildMeetupBinding({
          cameraId: CAMERA_ID,
          configVersion: "geoapify-v1",
          handoffTime: "09:00",
          pickupDate: "2099-08-24",
          policyVersion: 3,
          renterId: "user-1",
          returnDate: "2099-08-26",
          routingPolicyVersion: "mapbox-matrix-v1",
        }),
        city: "Cebu City",
        configVersion: "geoapify-v1",
        expiresAt: "2099-08-24T00:00:00.000Z",
        latitude: 10.317,
        longitude: 123.905,
        name: "Ayala Center Cebu",
        renterCity: { label: "Mandaue City" },
        routingPolicyVersion: "mapbox-matrix-v1",
      },
      process.env.MEETUP_RECOMMENDATION_SECRET,
    );

    await expect(
      requestBooking(
        { status: "idle" },
        fields({
          camera: CAMERA_ID,
          expectedLocation: "Cebu City",
          handoffTime: "09:00",
          intendedUse: "Family event",
          meetupReference: reference,
          pickupDate: "2099-08-24",
          policyVersion: "3",
          returnDate: "2099-08-26",
        }),
      ),
    ).resolves.toMatchObject({ error, status: "error" });
    expect(adminRpc).toHaveBeenCalledTimes(1);
  });

  it("constrains persistence failures without revealing provider details", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "23503", message: "secret table and renter id" },
    });
    const active = profileQuery({ data: { account_status: "active" }, error: null });
    const supabase = { ...active.client, ...rpcClient(rpc) } as never;
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      supabase,
      user: { id: "user-1" },
    } as never);

    const result = await requestBooking(
      { status: "idle" },
      fields({
        camera: CAMERA_ID,
        expectedLocation: "Quezon City",
        intendedUse: "Family event",
        pickup: "2099-08-14T09:00",
        return: "2099-08-15T09:00",
      }),
    );

    expect(result).toMatchObject({
      error: "request_failed",
      status: "error",
      values: {
        expectedLocation: "Quezon City",
        intendedUse: "Family event",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret table");
  });

  it("fails closed when the profile prerequisite query fails", async () => {
    const query = profileQuery({
      data: null,
      error: { code: "08006", message: "profile table details" },
    });
    const rpc = vi.fn();
    const supabase = { ...query.client, ...rpcClient(rpc) } as never;
    vi.mocked(getAuthenticatedUser).mockResolvedValue({
      supabase,
      user: { id: "user-1" },
    } as never);

    const result = await requestBooking(
      { status: "idle" },
      fields({
        camera: CAMERA_ID,
        expectedLocation: "Quezon City",
        intendedUse: "Family event",
        pickup: "2099-08-14T09:00",
        return: "2099-08-15T09:00",
      }),
    );

    expect(result).toEqual({
      error: "request_failed",
      status: "error",
      values: {
        expectedLocation: "Quezon City",
        intendedUse: "Family event",
      },
    });
    expect(JSON.stringify(result)).not.toContain("profile table details");
    expect(rpc).not.toHaveBeenCalled();
  });
});
