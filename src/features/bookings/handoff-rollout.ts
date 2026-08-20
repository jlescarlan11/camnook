import "server-only";

export function isHandoffSchedulingEnabled() {
  return process.env.HANDOFF_SCHEDULING_ENABLED === "true";
}
