import "server-only";

import { pickupInstructionsSchema } from "./types";

export function loadPickupInstructions() {
  const parsed = pickupInstructionsSchema.safeParse({
    contact: process.env.PICKUP_CONTACT,
    location: process.env.PICKUP_LOCATION,
    process: process.env.PICKUP_PROCESS,
  });

  return parsed.success
    ? ({ instructions: parsed.data, status: "success" } as const)
    : ({ status: "error" } as const);
}
