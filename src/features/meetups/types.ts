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
  reference: string;
};

export type MeetupRecommendationResult =
  | { recommendation: SafeMeetupRecommendation; status: "available" }
  | { reason: MeetupUnavailableReason; status: "unavailable" };
