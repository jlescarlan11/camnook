import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isHandoffSchedulingEnabled } from "./handoff-rollout";

const original = process.env.HANDOFF_SCHEDULING_ENABLED;

afterEach(() => {
  if (original === undefined) delete process.env.HANDOFF_SCHEDULING_ENABLED;
  else process.env.HANDOFF_SCHEDULING_ENABLED = original;
});

describe("handoff scheduling rollout", () => {
  it("fails closed unless the server-only value is exactly true", () => {
    delete process.env.HANDOFF_SCHEDULING_ENABLED;
    expect(isHandoffSchedulingEnabled()).toBe(false);
    process.env.HANDOFF_SCHEDULING_ENABLED = "TRUE";
    expect(isHandoffSchedulingEnabled()).toBe(false);
    process.env.HANDOFF_SCHEDULING_ENABLED = "true";
    expect(isHandoffSchedulingEnabled()).toBe(true);
  });
});
