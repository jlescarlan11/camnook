import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadAdminBookingDetail, loadAdminQueue } from "./data";

const BOOKING_ID = "22222222-2222-4222-8222-222222222222";
const CAMERA_ID = "11111111-1111-4111-8111-111111111111";
const RENTER_ID = "33333333-3333-4333-8333-333333333333";
const CONTRACT_ID = "44444444-4444-4444-8444-444444444444";
const TEMPLATE_ID = "55555555-5555-4555-8555-555555555555";

type QueryResult = { data: unknown; error: unknown };
type QueryOperation = { args: unknown[]; name: string };

class QueryBuilder implements PromiseLike<QueryResult> {
  readonly operations: QueryOperation[] = [];

  constructor(
    readonly table: string,
    private readonly result: QueryResult,
  ) {}

  select(...args: unknown[]) {
    this.operations.push({ args, name: "select" });
    return this;
  }

  eq(...args: unknown[]) {
    this.operations.push({ args, name: "eq" });
    return this;
  }

  in(...args: unknown[]) {
    this.operations.push({ args, name: "in" });
    return this;
  }

  gt(...args: unknown[]) {
    this.operations.push({ args, name: "gt" });
    return this;
  }

  lt(...args: unknown[]) {
    this.operations.push({ args, name: "lt" });
    return this;
  }

  is(...args: unknown[]) {
    this.operations.push({ args, name: "is" });
    return this;
  }

  not(...args: unknown[]) {
    this.operations.push({ args, name: "not" });
    return this;
  }

  order(...args: unknown[]) {
    this.operations.push({ args, name: "order" });
    return this;
  }

  limit(...args: unknown[]) {
    this.operations.push({ args, name: "limit" });
    return this;
  }

  maybeSingle() {
    this.operations.push({ args: [], name: "maybeSingle" });
    return Promise.resolve(this.result);
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function adminContext(
  results: Record<string, QueryResult | QueryResult[]>,
  quoteResult: QueryResult = { data: [], error: null },
) {
  const builders: QueryBuilder[] = [];
  const nextResult = (table: string) => {
    const configured = results[table];
    if (Array.isArray(configured)) {
      const next = configured.shift();
      if (!next) throw new Error(`No configured result for ${table}`);
      return next;
    }
    return configured ?? { data: [], error: null };
  };
  const from = vi.fn((table: string) => {
    const builder = new QueryBuilder(table, nextResult(table));
    builders.push(builder);
    return builder;
  });
  const rpc = vi.fn().mockResolvedValue(quoteResult);
  const schema = vi.fn(() => ({ rpc }));
  return {
    builders,
    context: {
      supabase: { from, schema },
      user: { id: "admin-user" },
    } as never,
    from,
    rpc,
    schema,
  };
}

function operation(builder: QueryBuilder, name: string) {
  return builder.operations.filter((item) => item.name === name);
}

function queuedBooking(overrides: Record<string, unknown> = {}) {
  return {
    camera_id: CAMERA_ID,
    id: BOOKING_ID,
    pickup_at: "2026-08-20T01:00:00.000Z",
    renter_id: RENTER_ID,
    requested_at: "2026-08-13T08:00:00.000Z",
    return_at: "2026-08-21T01:00:00.000Z",
    ...overrides,
  };
}

function fullBooking(overrides: Record<string, unknown> = {}) {
  return {
    approval_deadline_at: null,
    approved_at: null,
    billable_days_snapshot: null,
    camera_id: CAMERA_ID,
    currency: "PHP",
    current_contract_version_id: null,
    daily_rate_snapshot: null,
    expected_location: "Quezon City",
    id: BOOKING_ID,
    intended_use: "Family event",
    meetup_snapshot_required: false,
    pickup_at: "2026-08-20T01:00:00.000Z",
    rental_amount: null,
    renter_id: RENTER_ID,
    requested_at: "2026-08-13T08:00:00.000Z",
    return_at: "2026-08-21T01:00:00.000Z",
    security_deposit_amount: null,
    state: "FOR_REVIEW",
    total_due: null,
    ...overrides,
  };
}

function detailResults(
  booking = fullBooking(),
): Record<string, QueryResult> {
  return {
    booking_state_history: { data: [], error: null },
    bookings: { data: booking, error: null },
    camera_accessories: {
      data: [
        {
          id: "66666666-6666-4666-8666-666666666666",
          name: "Battery",
          quantity: 2,
          sort_position: 1,
          replacement_value: 99_999,
        },
      ],
      error: null,
    },
    cameras: {
      data: {
        acquisition_cost: 1,
        archived_at: null,
        daily_rate: 1200,
        id: CAMERA_ID,
        internal_notes: "never expose",
        name: "Sony A7",
        published_at: "2026-01-01T00:00:00.000Z",
        replacement_value: 2,
        security_deposit: 5000,
        serial_number: "SECRET-SERIAL",
        slug: "sony-a7",
        status: "published",
      },
      error: null,
    },
    contract_templates: {
      data: {
        activated_at: "2026-01-01T00:00:00.000Z",
        approved_at: "2026-01-01T00:00:00.000Z",
        deactivated_at: null,
        id: TEMPLATE_ID,
        schema_version: 1,
        terms: {
          cancellation: {},
          damage: {},
          loss: {},
          "late-return": {},
          "non-transferability": {},
          pickup: {},
          return: {},
        },
        version: "v1",
      },
      error: null,
    },
    contract_versions: { data: null, error: null },
    booking_meetup_plans: { data: null, error: null },
    profiles: {
      data: {
        account_status: "active",
        legal_name: "Maria Santos",
        phone: "+63 917 123 4567",
        updated_at: "private-noise",
      },
      error: null,
    },
    public_availability: {
      data: [
        {
          camera_id: CAMERA_ID,
          ends_at: "2026-08-19T01:00:00.000Z",
          reason: "Booked",
          starts_at: "2026-08-18T01:00:00.000Z",
        },
      ],
      error: null,
    },
    verification_records: {
      data: {
        decided_at: "2026-08-13T00:00:00.000Z",
        document_expiration_date: "2027-01-01",
        id: "77777777-7777-4777-8777-777777777777",
        id_type: "Passport",
        rejection_reason: "private",
        status: "verified",
        submitted_at: "2026-08-12T00:00:00.000Z",
      },
      error: null,
    },
  };
}

const quoteResult = {
  data: [
    {
      billable_days: 1,
      camera_id: CAMERA_ID,
      currency: "PHP",
      daily_rate: 1200,
      pickup_at: "2026-08-20T01:00:00.000Z",
      rental_amount: 1200,
      return_at: "2026-08-21T01:00:00.000Z",
      security_deposit: 5000,
      total_due: 6200,
    },
  ],
  error: null,
};

describe("admin booking queue data", () => {
  it("queries FOR_REVIEW records with allowlists and projects only queue data", async () => {
    const fixture = queuedBooking({
      operator_notes: "private notes",
      total_due: 1,
    });
    const harness = adminContext({
      bookings: { data: [fixture], error: null },
      cameras: {
        data: [{ id: CAMERA_ID, name: "Sony A7", serial_number: "private" }],
        error: null,
      },
      profiles: {
        data: [{ legal_name: "Maria Santos", phone: "not for queue", user_id: RENTER_ID }],
        error: null,
      },
    });

    await expect(loadAdminQueue(harness.context)).resolves.toEqual({
      bookings: [
        {
          cameraName: "Sony A7",
          id: BOOKING_ID,
          pickupAt: "2026-08-20T01:00:00.000Z",
          renterLegalName: "Maria Santos",
          requestedAt: "2026-08-13T08:00:00.000Z",
          returnAt: "2026-08-21T01:00:00.000Z",
        },
      ],
      status: "success",
    });

    const bookings = harness.builders.find((item) => item.table === "bookings")!;
    const profiles = harness.builders.find((item) => item.table === "profiles")!;
    const cameras = harness.builders.find((item) => item.table === "cameras")!;
    expect(operation(bookings, "select")[0].args).toEqual([
      "id,renter_id,camera_id,pickup_at,return_at,requested_at",
    ]);
    expect(operation(bookings, "eq")).toContainEqual({
      args: ["state", "FOR_REVIEW"],
      name: "eq",
    });
    expect(operation(profiles, "select")[0].args).toEqual([
      "user_id,legal_name",
    ]);
    expect(operation(cameras, "select")[0].args).toEqual(["id,name"]);
    expect(JSON.stringify(await loadAdminQueue(harness.context))).not.toMatch(
      /operator_notes|serial_number|phone|total_due|private notes/,
    );
  });

  it("returns an accessible-page empty result without related queries", async () => {
    const harness = adminContext({ bookings: { data: [], error: null } });

    await expect(loadAdminQueue(harness.context)).resolves.toEqual({
      bookings: [],
      status: "success",
    });
    expect(harness.from).toHaveBeenCalledTimes(1);
  });

  it("constrains a queue read failure", async () => {
    const harness = adminContext({
      bookings: {
        data: null,
        error: { message: "database host and private relation" },
      },
    });

    await expect(loadAdminQueue(harness.context)).resolves.toEqual({
      status: "error",
    });
  });
});

describe("admin booking detail data", () => {
  it("rejects an invalid ID before any query", async () => {
    const harness = adminContext({});

    await expect(
      loadAdminBookingDetail(harness.context, "not-a-uuid", new Date()),
    ).resolves.toEqual({ status: "missing" });
    expect(harness.from).not.toHaveBeenCalled();
  });

  it("reads deterministic metadata and returns a privacy-minimal ready DTO", async () => {
    const harness = adminContext(detailResults(), quoteResult);

    const result = await loadAdminBookingDetail(
      harness.context,
      BOOKING_ID,
      new Date("2026-08-13T16:30:00.000Z"),
    );

    expect(result).toMatchObject({
      booking: {
        accessories: [
          {
            id: "66666666-6666-4666-8666-666666666666",
            name: "Battery",
            quantity: 2,
          },
        ],
        availability: [
          {
            endsAt: "2026-08-19T01:00:00.000Z",
            reason: "Booked",
            startsAt: "2026-08-18T01:00:00.000Z",
          },
        ],
        camera: {
          dailyRate: 1200,
          name: "Sony A7",
          securityDeposit: 5000,
          slug: "sony-a7",
        },
        profile: {
          accountStatus: "active",
          legalName: "Maria Santos",
          phone: "+63 917 123 4567",
        },
        quote: {
          billableDays: 1,
          currency: "PHP",
          dailyRate: 1200,
          rentalAmount: 1200,
          securityDeposit: 5000,
          totalDue: 6200,
        },
        readiness: { ready: true, reasons: [] },
        state: "FOR_REVIEW",
      },
      status: "success",
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(
      /verification_documents|object_path|signed|serial_number|SECRET-SERIAL|acquisition_cost|replacement_value|internal_notes|rejection_reason|operator_notes|actor_user_id|metadata|content_sha256|snapshot|rendered_pdf_path/,
    );

    expect(harness.from).not.toHaveBeenCalledWith("verification_documents");
    expect(harness.from).not.toHaveBeenCalledWith("verification_records");
    const bookingQuery = harness.builders.find(
      (item) => item.table === "bookings",
    )!;
    expect(operation(bookingQuery, "select")[0].args).toEqual([
      "id,renter_id,camera_id,state,pickup_at,return_at,intended_use,expected_location,requested_at,approved_at,approval_deadline_at,billable_days_snapshot,daily_rate_snapshot,rental_amount,security_deposit_amount,total_due,currency,current_contract_version_id,meetup_snapshot_required",
    ]);
    expect(operation(bookingQuery, "eq")).toEqual([
      { args: ["id", BOOKING_ID], name: "eq" },
    ]);
    const profileQuery = harness.builders.find((item) => item.table === "profiles")!;
    expect(operation(profileQuery, "select")[0].args).toEqual([
      "user_id,legal_name,phone,account_status",
    ]);
    expect(operation(profileQuery, "eq")).toEqual([
      { args: ["user_id", RENTER_ID], name: "eq" },
    ]);
    const meetupQuery = harness.builders.find(
      (item) => item.table === "booking_meetup_plans",
    )!;
    expect(operation(meetupQuery, "select")[0].args).toEqual([
      "booking_id,renter_city_label,venue_name,venue_address,venue_city,venue_latitude,venue_longitude,provider,provider_config_version,attribution,created_at",
    ]);
    expect(JSON.stringify(operation(meetupQuery, "select"))).not.toMatch(
      /provider_place_id|renter_city_provider_id/,
    );
    const cameraQuery = harness.builders.find((item) => item.table === "cameras")!;
    expect(operation(cameraQuery, "select")[0].args).toEqual([
      "id,slug,name,status,published_at,daily_rate,security_deposit",
    ]);
    expect(operation(cameraQuery, "eq")).toEqual([
      { args: ["id", CAMERA_ID], name: "eq" },
    ]);
    const accessoryQuery = harness.builders.find(
      (item) => item.table === "camera_accessories",
    )!;
    expect(operation(accessoryQuery, "select")[0].args).toEqual([
      "id,name,quantity,sort_position",
    ]);
    expect(operation(accessoryQuery, "eq")).toEqual([
      { args: ["camera_id", CAMERA_ID], name: "eq" },
    ]);
    expect(operation(accessoryQuery, "is")).toEqual([
      { args: ["archived_at", null], name: "is" },
    ]);
    expect(operation(accessoryQuery, "order")).toEqual([
      { args: ["sort_position"], name: "order" },
      { args: ["name"], name: "order" },
      { args: ["id"], name: "order" },
    ]);
    const availabilityQuery = harness.builders.find(
      (item) => item.table === "public_availability",
    )!;
    expect(operation(availabilityQuery, "select")[0].args).toEqual([
      "starts_at,ends_at,reason",
    ]);
    expect(operation(availabilityQuery, "eq")).toEqual([
      { args: ["camera_id", CAMERA_ID], name: "eq" },
    ]);
    expect(operation(availabilityQuery, "lt")).toEqual([
      {
        args: ["starts_at", "2026-08-21T01:00:00.000Z"],
        name: "lt",
      },
    ]);
    expect(operation(availabilityQuery, "gt")).toEqual([
      {
        args: ["ends_at", "2026-08-20T01:00:00.000Z"],
        name: "gt",
      },
    ]);
    expect(operation(availabilityQuery, "order")).toEqual([
      { args: ["starts_at"], name: "order" },
    ]);
    const templateQuery = harness.builders.find(
      (item) => item.table === "contract_templates",
    )!;
    expect(operation(templateQuery, "select")[0].args).toEqual([
      "id,version,schema_version,terms,approved_at,activated_at,deactivated_at",
    ]);
    expect(operation(templateQuery, "not")).toEqual([
      { args: ["approved_at", "is", null], name: "not" },
      { args: ["activated_at", "is", null], name: "not" },
    ]);
    expect(operation(templateQuery, "is")).toEqual([
      { args: ["deactivated_at", null], name: "is" },
    ]);
    expect(operation(templateQuery, "order")).toEqual([
      { args: ["id"], name: "order" },
    ]);
    expect(operation(templateQuery, "limit")).toEqual([
      { args: [1], name: "limit" },
    ]);
    expect(harness.from.mock.calls.map(([table]) => table)).toEqual([
      "bookings",
      "profiles",
      "cameras",
      "camera_accessories",
      "public_availability",
      "contract_templates",
      "booking_meetup_plans",
    ]);
    expect(harness.rpc).toHaveBeenCalledWith("quote_booking", {
      p_camera_id: CAMERA_ID,
      p_pickup_at: "2026-08-20T01:00:00.000Z",
      p_return_at: "2026-08-21T01:00:00.000Z",
    });
  });

  it("keeps a quote failure as a fail-closed readiness reason without raw details", async () => {
    const harness = adminContext(detailResults(), {
      data: null,
      error: { message: "private quote internals" },
    });

    const result = await loadAdminBookingDetail(
      harness.context,
      BOOKING_ID,
      new Date("2026-08-13T16:30:00.000Z"),
    );

    expect(result).toMatchObject({
      booking: {
        quote: null,
        readiness: { ready: false, reasons: ["quote_unavailable"] },
      },
      status: "success",
    });
    expect(JSON.stringify(result)).not.toContain("private quote internals");
  });

  it("renders only persisted approval values and a safe contract reference", async () => {
    const booking = fullBooking({
      approval_deadline_at: "2026-08-14T08:00:00.000Z",
      approved_at: "2026-08-13T08:00:00.000Z",
      billable_days_snapshot: 2,
      current_contract_version_id: CONTRACT_ID,
      daily_rate_snapshot: 1200,
      rental_amount: 2400,
      security_deposit_amount: 5000,
      state: "CONTRACT_PENDING",
      total_due: 7400,
    });
    const results = detailResults(booking);
    results.contract_versions = {
      data: {
        content_sha256: "private",
        id: CONTRACT_ID,
        issued_at: "2026-08-13T08:00:00.000Z",
        rendered_pdf_path: "private/contracts/file.pdf",
        snapshot: { private: true },
        status: "issued",
        template_id: TEMPLATE_ID,
        version_no: 1,
      },
      error: null,
    };
    const harness = adminContext(results);

    const result = await loadAdminBookingDetail(
      harness.context,
      BOOKING_ID,
      new Date("2026-08-13T16:30:00.000Z"),
    );

    expect(result).toMatchObject({
      booking: {
        approval: {
          approvalDeadlineAt: "2026-08-14T08:00:00.000Z",
          approvedAt: "2026-08-13T08:00:00.000Z",
          billableDays: 2,
          contractReference: {
            id: CONTRACT_ID,
            issuedAt: "2026-08-13T08:00:00.000Z",
            status: "issued",
            templateId: TEMPLATE_ID,
            versionNo: 1,
          },
          currentContractVersionId: CONTRACT_ID,
          dailyRate: 1200,
          rentalAmount: 2400,
          securityDeposit: 5000,
          totalDue: 7400,
        },
        state: "CONTRACT_PENDING",
      },
      status: "success",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /content_sha256|rendered_pdf_path|snapshot|private\/contracts/,
    );
    const contractQuery = harness.builders.find(
      (item) => item.table === "contract_versions",
    )!;
    expect(operation(contractQuery, "select")[0].args).toEqual([
      "id,template_id,version_no,status,issued_at",
    ]);
    expect(operation(contractQuery, "eq")).toEqual([
      { args: ["id", CONTRACT_ID], name: "eq" },
    ]);
    expect(harness.from.mock.calls.map(([table]) => table)).toEqual([
      "bookings",
      "profiles",
      "cameras",
      "camera_accessories",
      "public_availability",
      "contract_templates",
      "booking_meetup_plans",
      "contract_versions",
    ]);
    expect(harness.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [
      "missing snapshot",
      fullBooking({
        approval_deadline_at: "2026-08-14T08:00:00.000Z",
        approved_at: "2026-08-13T08:00:00.000Z",
        billable_days_snapshot: null,
        current_contract_version_id: CONTRACT_ID,
        daily_rate_snapshot: 1200,
        rental_amount: 2400,
        security_deposit_amount: 5000,
        state: "CONTRACT_PENDING",
        total_due: 7400,
      }),
      { data: { id: CONTRACT_ID, issued_at: "2026-08-13T08:00:00.000Z", status: "issued", template_id: TEMPLATE_ID, version_no: 1 }, error: null },
    ],
    [
      "missing contract row",
      fullBooking({
        approval_deadline_at: "2026-08-14T08:00:00.000Z",
        approved_at: "2026-08-13T08:00:00.000Z",
        billable_days_snapshot: 2,
        current_contract_version_id: CONTRACT_ID,
        daily_rate_snapshot: 1200,
        rental_amount: 2400,
        security_deposit_amount: 5000,
        state: "CONTRACT_PENDING",
        total_due: 7400,
      }),
      { data: null, error: null },
    ],
  ])("does not present an incomplete persisted approval aggregate: %s", async (_case, booking, contractVersions) => {
    const results = detailResults(booking);
    results.contract_versions = contractVersions;
    const harness = adminContext(results);

    const result = await loadAdminBookingDetail(
      harness.context,
      BOOKING_ID,
      new Date("2026-08-13T16:30:00.000Z"),
    );

    expect(result).toEqual({ status: "inconsistent" });
  });

  it("returns only the durable rejection note and time", async () => {
    const results = detailResults(fullBooking({ state: "REJECTED" }));
    results.booking_state_history = {
      data: {
        actor_user_id: "private-admin",
        metadata: { private: true },
        note: "Dates cannot be supported",
        occurred_at: "2026-08-13T09:00:00.000Z",
        operation_id: "private-operation",
      },
      error: null,
    };
    const harness = adminContext(results);

    const result = await loadAdminBookingDetail(
      harness.context,
      BOOKING_ID,
      new Date("2026-08-13T16:30:00.000Z"),
    );

    expect(result).toMatchObject({
      booking: {
        rejection: {
          reason: "Dates cannot be supported",
          rejectedAt: "2026-08-13T09:00:00.000Z",
        },
        state: "REJECTED",
      },
      status: "success",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /actor_user_id|private-admin|metadata|operation_id|private-operation/,
    );
    const historyQuery = harness.builders.find(
      (item) => item.table === "booking_state_history",
    )!;
    expect(operation(historyQuery, "select")[0].args).toEqual([
      "note,occurred_at",
    ]);
    expect(operation(historyQuery, "eq")).toEqual([
      { args: ["booking_id", BOOKING_ID], name: "eq" },
      { args: ["to_state", "REJECTED"], name: "eq" },
    ]);
    expect(operation(historyQuery, "order")).toEqual([
      { args: ["occurred_at", { ascending: false }], name: "order" },
      { args: ["id", { ascending: false }], name: "order" },
    ]);
    expect(operation(historyQuery, "limit")).toEqual([
      { args: [1], name: "limit" },
    ]);
    expect(harness.from.mock.calls.map(([table]) => table)).toEqual([
      "bookings",
      "profiles",
      "cameras",
      "camera_accessories",
      "public_availability",
      "contract_templates",
      "booking_meetup_plans",
      "booking_state_history",
    ]);
  });

  it("treats a rejected booking without durable reason history as inconsistent", async () => {
    const results = detailResults(fullBooking({ state: "REJECTED" }));
    results.booking_state_history = { data: null, error: null };
    const harness = adminContext(results);

    await expect(
      loadAdminBookingDetail(
        harness.context,
        BOOKING_ID,
        new Date("2026-08-13T16:30:00.000Z"),
      ),
    ).resolves.toEqual({ status: "inconsistent" });
  });

  it("constrains a required detail read failure", async () => {
    const results = detailResults();
    results.profiles = {
      data: null,
      error: { message: "profile provider detail" },
    };
    const harness = adminContext(results, quoteResult);

    const result = await loadAdminBookingDetail(
      harness.context,
      BOOKING_ID,
      new Date(),
    );

    expect(result).toEqual({ status: "error" });
    expect(JSON.stringify(result)).not.toContain("profile provider detail");
  });
});
