import "server-only";

import { createHash } from "node:crypto";

export type MeetupBindingInput = {
  cameraId: string;
  configVersion: string;
  handoffTime: string;
  pickupDate: string;
  policyVersion: number;
  renterId: string;
  returnDate: string;
};

export function buildMeetupBinding(input: MeetupBindingInput) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        "camnook-meetup-v1",
        input.renterId,
        input.cameraId,
        input.pickupDate,
        input.returnDate,
        input.handoffTime,
        input.policyVersion,
        input.configVersion,
      ]),
    )
    .digest("base64url");
}
