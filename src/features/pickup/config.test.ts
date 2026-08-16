import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadPickupInstructions } from "./config";

const original = {
  contact: process.env.PICKUP_CONTACT,
  location: process.env.PICKUP_LOCATION,
  process: process.env.PICKUP_PROCESS,
};

afterEach(() => {
  setOrDelete("PICKUP_CONTACT", original.contact);
  setOrDelete("PICKUP_LOCATION", original.location);
  setOrDelete("PICKUP_PROCESS", original.process);
});

function setOrDelete(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("pickup instructions configuration", () => {
  it("fails closed until every server-only operating fact is configured", () => {
    delete process.env.PICKUP_CONTACT;
    process.env.PICKUP_LOCATION = "Private counter";
    process.env.PICKUP_PROCESS = "Arrive at the scheduled time.";

    expect(loadPickupInstructions()).toEqual({ status: "error" });
  });

  it("returns trimmed schedule-independent instructions", () => {
    process.env.PICKUP_CONTACT = "  +63 917 123 4567  ";
    process.env.PICKUP_LOCATION = "  Private counter  ";
    process.env.PICKUP_PROCESS = "  Present the original ID first.  ";

    expect(loadPickupInstructions()).toEqual({
      instructions: {
        contact: "+63 917 123 4567",
        location: "Private counter",
        process: "Present the original ID first.",
      },
      status: "success",
    });
  });
});
