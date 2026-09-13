import Link from "next/link";
import type { ApprovalReadinessReason } from "./readiness";

const readinessMessages: Record<ApprovalReadinessReason, string> = {
  availability_overlap:
    "The requested period overlaps current sanitized availability.",
  camera_unavailable:
    "The camera is not published and active with complete pricing.",
  profile_inactive: "The renter profile is not active.",
  pickup_passed: "The requested pickup time has passed. This request cannot be approved for those dates. Ask the renter to submit a new schedule.",
  quote_unavailable: "The authoritative quote could not be obtained.",
  template_invalid:
    "The active contract template is missing required terms.",
  template_unavailable: "No active approved contract template is available.",
};

export function ApprovalReadinessPanel({ bookingId, readiness }: { bookingId: string; readiness: { ready: boolean; reasons: ApprovalReadinessReason[] } }) {
  return (
    <section
      className="mt-7 border-t border-stone-200 pt-6"
      aria-labelledby="readiness-heading"
    >
      <h2 className="text-xl font-semibold" id="readiness-heading">
        Approval readiness
      </h2>
      <p
        className={`mt-4 rounded-xl border p-4 text-sm leading-6 ${
          readiness.ready
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-red-200 bg-red-50 text-red-900"
        }`}
        role="status"
      >
        {readiness.ready
          ? "Advisory checks pass. The approval RPC will recheck every condition atomically."
          : "Approval is blocked in the interface. Review the unmet conditions below."}
      </p>
      {readiness.reasons.length > 0 ? (
        <ul className="mt-4 list-disc space-y-2 pl-6 text-sm text-red-900">
          {readiness.reasons.map((reason) => (
            <li key={reason}>
              {readinessMessages[reason]}{" "}
              {reason === "template_invalid" || reason === "template_unavailable" ? <Link className="font-semibold underline" href={`/admin/settings#contracts`}>Fix contract template</Link> : reason === "camera_unavailable" ? <Link className="font-semibold underline" href="/admin/settings#handoffs">Fix camera handoff policy</Link> : reason === "quote_unavailable" ? <Link className="font-semibold underline" href={`/admin/bookings/${bookingId}`}>Retry readiness check</Link> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
