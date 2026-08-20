import "server-only";

import type { MeetupProviderTelemetry } from "./service";

export function recordMeetupTelemetry(event: MeetupProviderTelemetry) {
  console.info(
    JSON.stringify({
      event: "meetup_recommendation",
      resultCount: event.resultCount,
      speed: event.durationBucket,
      status: event.status,
    }),
  );
}
