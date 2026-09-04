import { describe, expect, it } from "vitest";

import {
  choicesForFriendlyArea,
  choicesForProvinceOrArea,
  createLatestRequestGate,
  psgcLevelLabel,
} from "./psgc-area-selector";

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

  it("keeps province separate when a region has independent cities", () => {
    expect(psgcLevelLabel(1, [choice("province"), choice("city")])).toBe(
      "Province",
    );
  });

  it("presents Cebu's highly urbanized cities inside the familiar Cebu area", () => {
    const cebuProvince = { ...choice("province"), code: "0702200000" };
    const cebuCity = choice("city");
    const mandaueCity = {
      ...choice("city"),
      code: "0731300000",
      name: "City of Mandaue",
    };
    const lapuLapuCity = {
      ...choice("city"),
      code: "0731100000",
      name: "City of Lapu-Lapu",
    };
    const unrelatedIndependentCity = {
      ...choice("city"),
      code: "1030500000",
      name: "City of Cagayan de Oro",
    };

    expect(choicesForProvinceOrArea([
      cebuProvince,
      cebuCity,
      lapuLapuCity,
      mandaueCity,
      unrelatedIndependentCity,
    ])).toEqual([cebuProvince, unrelatedIndependentCity]);
    expect(
      choicesForFriendlyArea(
        [cebuProvince, cebuCity, lapuLapuCity, mandaueCity],
        cebuProvince.code,
        [{ ...choice("municipality"), code: "0702201000", name: "Alcantara" }],
      ).map((item) => item.name),
    ).toEqual([
      "Alcantara",
      "City of Cebu",
      "City of Lapu-Lapu",
      "City of Mandaue",
    ]);
  });

  it("labels ordinary province and barangay levels precisely", () => {
    expect(psgcLevelLabel(1, [choice("province")])).toBe("Province");
    expect(psgcLevelLabel(3, [choice("barangay")])).toBe("Barangay");
  });
});
