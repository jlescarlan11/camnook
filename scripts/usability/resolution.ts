import type { ResolutionActionState } from "../../src/features/resolution/actions";
export async function requestCancellation(): Promise<ResolutionActionState> {
  return { status: "error", error: "indeterminate" };
}
export async function requestMyConditionPhotoAccess() {
  return { status: "error" as const, error: "unavailable" as const };
}
