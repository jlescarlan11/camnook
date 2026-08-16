import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => {
  class AdminAuthorizationRequiredError extends Error {}
  return {
    AdminAuthorizationRequiredError,
    isAuthenticationError: () => false,
    requireAdmin: vi.fn(),
  };
});
vi.mock("@/lib/auth/require-user", () => ({
  AuthenticationRequiredError: class AuthenticationRequiredError extends Error {},
  requireUser: vi.fn(),
}));

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/require-admin";
import {
  AuthenticationRequiredError,
  requireUser,
} from "@/lib/auth/require-user";

import {
  decideCancellation,
  recordExternalRefund,
  recordReturn,
  requestCancellation,
  resolveIssue,
  reverseExternalRefund,
} from "./actions";

const BOOKING_ID = "92000000-0000-4000-8000-000000000001";
const OPERATION_ID = "92000000-0000-4000-8000-000000000002";
const REQUEST_ID = "92000000-0000-4000-8000-000000000003";
const ACCESSORY_ID = "92000000-0000-4000-8000-000000000004";
const HANDOFF_ID = "92000000-0000-4000-8000-000000000005";
const REPORT_ID = "92000000-0000-4000-8000-000000000006";
const DECISION_ID = "92000000-0000-4000-8000-000000000007";
const RECORD_ID = "92000000-0000-4000-8000-000000000008";
const TRANSACTION_ID = "92000000-0000-4000-8000-000000000009";

function form() {
  const data = new FormData();
  data.set("bookingId", BOOKING_ID);
  data.set("operationId", OPERATION_ID);
  return data;
}

function authorizeAdmin(rpc: ReturnType<typeof vi.fn>) {
  vi.mocked(requireAdmin).mockResolvedValue({
    supabase: { schema: vi.fn(() => ({ rpc })) },
    user: { id: "admin" },
  } as never);
}

describe("resolution Server Actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("submits an owner cancellation request without a state mutation input", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        booking_id: BOOKING_ID,
        booking_state: "CONFIRMED",
        created: true,
        disposition: "pending",
        request_id: REQUEST_ID,
      },
      error: null,
    });
    vi.mocked(requireUser).mockResolvedValue({
      supabase: { schema: vi.fn(() => ({ rpc })) },
      user: { id: "owner" },
    } as never);
    const data = form();
    data.set("reason", "My plans changed.");

    await expect(requestCancellation({ status: "idle" }, data)).resolves.toEqual({
      result: "requested",
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("request_cancellation_resolution", {
      p_booking_id: BOOKING_ID,
      p_operation_id: OPERATION_ID,
      p_reason: "My plans changed.",
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/to_state|CANCELLED/);
    expect(revalidatePath).toHaveBeenCalledWith(`/account/bookings/${BOOKING_ID}`);
  });

  it("distinguishes missing owner authentication from an unknown auth outage", async () => {
    const data = form();
    data.set("reason", "My plans changed.");
    vi.mocked(requireUser).mockRejectedValueOnce(
      new AuthenticationRequiredError(),
    );

    await expect(requestCancellation({ status: "idle" }, data)).resolves.toEqual({
      error: "unauthorized",
      status: "error",
    });

    vi.mocked(requireUser).mockRejectedValueOnce(new Error("auth unavailable"));
    await expect(requestCancellation({ status: "idle" }, data)).resolves.toEqual({
      error: "indeterminate",
      status: "error",
    });
  });

  it("confirms an idempotent cancellation request after its persisted decision", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        booking_id: BOOKING_ID,
        booking_state: "CANCELLED",
        created: false,
        disposition: "accepted",
        request_id: REQUEST_ID,
      },
      error: null,
    });
    vi.mocked(requireUser).mockResolvedValue({
      supabase: { schema: vi.fn(() => ({ rpc })) },
      user: { id: "owner" },
    } as never);
    const data = form();
    data.set("reason", "My plans changed.");

    await expect(requestCancellation({ status: "idle" }, data)).resolves.toEqual({
      result: "requested",
      status: "success",
    });
  });

  it("records exact return time, serial, condition, and one status per inclusion", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        booking_id: BOOKING_ID,
        booking_state: "RETURN_REVIEW",
        condition_report_id: REPORT_ID,
        created: true,
        handoff_id: HANDOFF_ID,
      },
      error: null,
    });
    authorizeAdmin(rpc);
    const data = form();
    data.set("actualAt", "2026-08-16T10:00");
    data.set("cameraHasDamage", "yes");
    data.set("cameraSerial", "OBSERVED-RETURN-SERIAL");
    data.set("conditionSummary", "New mark on the camera body.");
    data.set("notes", "Awaiting evidence review.");
    data.append("accessoryId", ACCESSORY_ID);
    data.set(`accessoryStatus-${ACCESSORY_ID}`, "damaged");

    await expect(recordReturn({ status: "idle" }, data)).resolves.toEqual({
      result: "recorded",
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("record_return_inspection", {
      p_accessory_results: [{ id: ACCESSORY_ID, status: "damaged" }],
      p_actual_at: "2026-08-16T10:00:00+08:00",
      p_booking_id: BOOKING_ID,
      p_camera_has_damage: true,
      p_camera_serial: "OBSERVED-RETURN-SERIAL",
      p_condition_summary: "New mark on the camera body.",
      p_notes: "Awaiting evidence review.",
      p_operation_id: OPERATION_ID,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/deduction|late.amount|refund/);
  });

  it("rejects a malformed accessory checklist before administrator authorization", async () => {
    const data = form();
    data.set("actualAt", "2026-08-16T10:00");
    data.set("cameraSerial", "OBSERVED-RETURN-SERIAL");
    data.set("conditionSummary", "Returned clean.");
    data.set("notes", "");
    data.append("accessoryId", ACCESSORY_ID);

    await expect(recordReturn({ status: "idle" }, data)).resolves.toMatchObject({
      error: "invalid",
      status: "error",
    });
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("keeps cancellation financial effects zero and surfaces the unresolved paid policy", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "0A000" },
    });
    authorizeAdmin(rpc);
    const data = form();
    data.set("decision", "accept");
    data.set("reason", "Requested after payment.");
    data.set("requestId", REQUEST_ID);

    await expect(decideCancellation({ status: "idle" }, data)).resolves.toEqual({
      error: "policy_unavailable",
      status: "error",
    });
    expect(rpc).toHaveBeenCalledWith("decide_cancellation_resolution", {
      p_accept: true,
      p_fee_amount: 0,
      p_operation_id: OPERATION_ID,
      p_reason: "Requested after payment.",
      p_refund_liability_amount: 0,
      p_request_id: REQUEST_ID,
    });
  });

  it("submits an explicit manual issue amount and separate renter explanation", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        booking_id: BOOKING_ID,
        booking_state: "COMPLETED",
        created: true,
        decision_id: DECISION_ID,
        deduction_amount: 1000,
      },
      error: null,
    });
    authorizeAdmin(rpc);
    const data = form();
    data.set("customerExplanation", "PHP 1,000 was approved for documented repair.");
    data.set("decisionKind", "damage");
    data.set("deductionAmount", "1000.00");
    data.set("internalReason", "Manual repair estimate supported by return evidence.");

    await expect(resolveIssue({ status: "idle" }, data)).resolves.toEqual({
      result: "resolved",
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("resolve_return_issue", {
      p_booking_id: BOOKING_ID,
      p_customer_explanation: "PHP 1,000 was approved for documented repair.",
      p_decision_kind: "damage",
      p_deduction_amount: 1000,
      p_internal_reason: "Manual repair estimate supported by return evidence.",
      p_operation_id: OPERATION_ID,
    });
  });

  it("records external refunds and corrections as distinct movements", async () => {
    const rpc = vi.fn(async (name: string) => ({
      data: {
        amount: name === "record_external_refund" ? 3000 : 3000,
        booking_id: BOOKING_ID,
        created: true,
        entry_kind: name === "record_external_refund" ? "refund" : "reversal",
        refund_record_id: RECORD_ID,
        remaining_liability: name === "record_external_refund" ? 0 : 3000,
        transaction_id: TRANSACTION_ID,
      },
      error: null,
    }));
    authorizeAdmin(rpc);
    const refund = form();
    refund.set("amount", "3000.00");
    refund.set("externalMovedAt", "2026-08-16T10:00");
    refund.set("recipientName", "Named Renter");
    refund.set("reference", "REFUND-1234");

    await expect(recordExternalRefund({ status: "idle" }, refund)).resolves.toEqual({
      result: "refund_recorded",
      status: "success",
    });

    const reversal = form();
    reversal.set("counterpartyName", "Named Renter");
    reversal.set("externalMovedAt", "2026-08-16T11:00");
    reversal.set("reason", "The transfer was returned.");
    reversal.set("reference", "REVERSAL-1234");
    reversal.set("refundRecordId", RECORD_ID);
    await expect(reverseExternalRefund({ status: "idle" }, reversal)).resolves.toEqual({
      result: "reversed",
      status: "success",
    });

    expect(rpc).toHaveBeenCalledWith("record_external_refund", expect.objectContaining({
      p_amount: 3000,
      p_external_moved_at: "2026-08-16T10:00:00+08:00",
      p_reference: "REFUND-1234",
    }));
    expect(rpc).toHaveBeenCalledWith("reverse_external_refund", expect.objectContaining({
      p_external_moved_at: "2026-08-16T11:00:00+08:00",
      p_refund_record_id: RECORD_ID,
    }));
  });
});
