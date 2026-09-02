import "server-only";

import type { MeetupProviderTelemetry } from "./service";

export function recordMeetupTelemetry(event: MeetupProviderTelemetry) {
  console.info(
    JSON.stringify({
      event: "meetup_recommendation",
      candidateCount: event.candidateCount,
      elementCount: event.elementCount,
      fallbackEligible: event.fallbackEligible,
      providerBudgetStatus: event.providerBudgetStatus,
      providerRequestCount: event.providerRequestCount,
      profile: event.profile,
      qualityRejectedCount: event.qualityRejectedCount,
      resultCount: event.resultCount,
      routingPolicyVersion: event.routingPolicyVersion,
      routingStatus: event.routingStatus,
      seedCount: event.seedCount,
      speed: event.durationBucket,
      status: event.status,
    }),
  );
}
