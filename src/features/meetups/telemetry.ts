import "server-only";

import type { MeetupProviderTelemetry } from "./service";

export function recordMeetupTelemetry(event: MeetupProviderTelemetry) {
  console.info(
    JSON.stringify({
      event: "meetup_recommendation",
      candidateCount: event.candidateCount,
      elementCount: event.elementCount,
      fallbackEligible: event.fallbackEligible,
      profile: event.profile,
      resultCount: event.resultCount,
      routingPolicyVersion: event.routingPolicyVersion,
      routingStatus: event.routingStatus,
      speed: event.durationBucket,
      status: event.status,
    }),
  );
}
