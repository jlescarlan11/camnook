import { describe, expect, it } from "vitest";

import { createLatestRequestGate, psgcLevelLabel } from "./psgc-area-selector";

const choice = (type: "barangay" | "city" | "municipality" | "province") => ({
  city_class: type === "city" ? "HUC" as const : null,
  code: type === "city" ? "0730600000" : "0722000000",
  has_children: true,
  name: type === "city" ? "City of Cebu" : "Cebu",
  type,
});

describe("PSGC cascade labels", () => {
  it("rejects a superseded cascade response that completes last", () => {
    const gate = createLatestRequestGate();
    const first = gate.begin();
    const second = gate.begin();

    expect(gate.isCurrent(second)).toBe(true);
    expect(gate.isCurrent(first)).toBe(false);
  });

  it("makes the independent-city branch explicit when a region has mixed children", () => {
    expect(psgcLevelLabel(1, [choice("province"), choice("city")])).toBe(
      "Province or independent city",
    );
  });

  it("labels ordinary province and barangay levels precisely", () => {
    expect(psgcLevelLabel(1, [choice("province")])).toBe("Province");
    expect(psgcLevelLabel(3, [choice("barangay")])).toBe("Barangay");
  });
});
