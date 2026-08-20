import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isMeetupPlanningEnabled } from "./rollout";

const original = process.env.MEETUP_PLANNING_ENABLED;

afterEach(() => {
  if (original === undefined) delete process.env.MEETUP_PLANNING_ENABLED;
  else process.env.MEETUP_PLANNING_ENABLED = original;
});

describe("meetup rollout gate", () => {
  it("fails closed unless the server value is exactly true", () => {
    for (const value of [undefined, "", "TRUE", "1", "yes", "false"]) {
      if (value === undefined) delete process.env.MEETUP_PLANNING_ENABLED;
      else process.env.MEETUP_PLANNING_ENABLED = value;
      expect(isMeetupPlanningEnabled()).toBe(false);
    }

    process.env.MEETUP_PLANNING_ENABLED = "true";
    expect(isMeetupPlanningEnabled()).toBe(true);
  });
});
