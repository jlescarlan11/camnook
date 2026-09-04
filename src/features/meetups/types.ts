export const MEETUP_UNAVAILABLE_REASONS = [
  "configuration",
  "empty",
  "invalid_input",
  "malformed",
  "network",
  "quota",
  "timeout",
  "unsupported_city",
] as const;

export type MeetupUnavailableReason =
  (typeof MEETUP_UNAVAILABLE_REASONS)[number];

export type SafeMeetupRecommendation = {
  address: string;
  attribution: "© OpenStreetMap contributors · Powered by Geoapify";
  city: string;
  configVersion: string;
  expiresAt: string;
  latitude: number;
  longitude: number;
  name: string;
  ownerCity: string;
  ownerTravelMinutes: number | null;
  routeEstimateApproximate: boolean;
  routeMode: "balanced" | "geoapify_fallback";
  renterCity: string;
  renterTravelMinutes: number | null;
  reference: string;
};

export type SafeCanonicalMeetupArea = {
  areaCode: string;
  areaLabel: string;
  expiresAt: string;
  path: Array<{
    code: string;
    name: string;
    type: "region" | "province" | "city" | "municipality" | "submunicipality" | "barangay";
  }>;
  reference: string;
  release: string;
};

export type MeetupRecommendationResult =
  | { recommendations: SafeMeetupRecommendation[]; status: "available" }
  | { reason: MeetupUnavailableReason; status: "unavailable" };
