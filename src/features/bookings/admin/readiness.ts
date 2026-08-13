export const REQUIRED_CONTRACT_TERM_KEYS = [
  "pickup",
  "return",
  "cancellation",
  "late-return",
  "damage",
  "loss",
  "non-transferability",
] as const;

export type ApprovalReadinessReason =
  | "availability_overlap"
  | "camera_unavailable"
  | "profile_inactive"
  | "quote_unavailable"
  | "template_invalid"
  | "template_unavailable"
  | "verification_expired"
  | "verification_missing"
  | "verification_not_verified";

export type ApprovalReadinessInput = {
  availability: { endsAt: string; startsAt: string }[];
  booking: { pickupAt: string; returnAt: string };
  camera: {
    dailyRate: number | null;
    publishedAt: string | null;
    securityDeposit: number | null;
    status: string;
  } | null;
  latestVerification: {
    documentExpirationDate: string | null;
    status: string;
  } | null;
  now: Date;
  profileStatus: string | null;
  quote: unknown | null;
  template: {
    activatedAt: string | null;
    approvedAt: string | null;
    deactivatedAt: string | null;
    terms: unknown;
  } | null;
};

const manilaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Manila",
  year: "numeric",
});

export function manilaBusinessDate(now: Date) {
  const parts = Object.fromEntries(
    manilaDateFormatter
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function templateHasRequiredTerms(terms: unknown) {
  if (typeof terms !== "object" || terms === null || Array.isArray(terms)) {
    return false;
  }

  return REQUIRED_CONTRACT_TERM_KEYS.every((key) =>
    Object.prototype.hasOwnProperty.call(terms, key),
  );
}

function periodsOverlap(
  requested: { pickupAt: string; returnAt: string },
  occupied: { startsAt: string; endsAt: string },
) {
  return (
    Date.parse(occupied.startsAt) < Date.parse(requested.returnAt) &&
    Date.parse(occupied.endsAt) > Date.parse(requested.pickupAt)
  );
}

export function assessApprovalReadiness(input: ApprovalReadinessInput) {
  const reasons: ApprovalReadinessReason[] = [];

  if (input.profileStatus !== "active") reasons.push("profile_inactive");

  if (!input.latestVerification) {
    reasons.push("verification_missing");
  } else if (input.latestVerification.status !== "verified") {
    reasons.push("verification_not_verified");
  } else if (
    !input.latestVerification.documentExpirationDate ||
    input.latestVerification.documentExpirationDate <
      manilaBusinessDate(input.now)
  ) {
    reasons.push("verification_expired");
  }

  if (
    !input.camera ||
    input.camera.status !== "published" ||
    input.camera.publishedAt === null ||
    input.camera.dailyRate === null ||
    input.camera.securityDeposit === null
  ) {
    reasons.push("camera_unavailable");
  }

  if (
    !input.template ||
    input.template.approvedAt === null ||
    input.template.activatedAt === null ||
    input.template.deactivatedAt !== null
  ) {
    reasons.push("template_unavailable");
  } else if (!templateHasRequiredTerms(input.template.terms)) {
    reasons.push("template_invalid");
  }

  if (!input.quote) reasons.push("quote_unavailable");

  if (
    input.availability.some((period) =>
      periodsOverlap(input.booking, period),
    )
  ) {
    reasons.push("availability_overlap");
  }

  return { ready: reasons.length === 0, reasons };
}
