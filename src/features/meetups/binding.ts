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
  routingPolicyVersion: string;
};

export function buildMeetupBinding(input: MeetupBindingInput) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        "camnook-meetup-v2",
        input.renterId,
        input.cameraId,
        input.pickupDate,
        input.returnDate,
        input.handoffTime,
        input.policyVersion,
        input.configVersion,
        input.routingPolicyVersion,
      ]),
    )
    .digest("base64url");
}
