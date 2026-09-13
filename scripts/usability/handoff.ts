import type { SaveHandoffPolicyState } from "../../src/features/listings/handoff-actions";

export async function saveCameraHandoffPolicy(_state: SaveHandoffPolicyState, data: FormData): Promise<SaveHandoffPolicyState> {
  if (String(data.get("approvedTimes")).includes("invalid")) return { status: "error", error: "invalid_input", fieldErrors: { approvedTimes: "Enter valid HH:MM times." } };
  // Vite fixture models the server redirect without a Next.js router.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  if (data.get("intent") === "continue") window.location.assign("/camera-preview");
  return { status: "success", cityLabel: "Synthetic area", version: 2 };
}
