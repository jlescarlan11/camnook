import "server-only";

export function isMeetupPlanningEnabled() {
  return process.env.MEETUP_PLANNING_ENABLED === "true";
}
