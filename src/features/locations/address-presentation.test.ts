import { describe, expect, it } from "vitest";
import { ADDRESS_GROUPS, groupForRegion, provinceAreaChoices, projectAddressPath } from "./address-presentation";
import { addressReferenceSchema } from "./types";
import { area, cebuPath, reference } from "./address-fixtures.test-support";

describe("shopping address presentation", () => {
  it("maps every official region without dropping Central Luzon, MIMAROPA or NIR", () => {
    const expected = [
      ["13", "metro-manila"], ["01", "north-luzon"], ["02", "north-luzon"], ["03", "north-luzon"], ["14", "north-luzon"],
      ["04", "south-luzon"], ["17", "south-luzon"], ["05", "south-luzon"],
      ["06", "visayas"], ["07", "visayas"], ["08", "visayas"], ["18", "visayas"],
      ["09", "mindanao"], ["10", "mindanao"], ["11", "mindanao"], ["12", "mindanao"], ["16", "mindanao"], ["19", "mindanao"],
    ];
    for (const [code, group] of expected) expect(groupForRegion(code + "00000000")).toBe(group);
    expect(groupForRegion("9900000000")).toBeNull();
    expect(ADDRESS_GROUPS.map(g => g.label)).toEqual(["Metro Manila", "North Luzon", "South Luzon", "Visayas", "Mindanao"]);
  });
  it("presents Cebu City within Cebu without changing its official path", () => {
    expect(provinceAreaChoices(reference, "visayas").map(c => c.label)).toEqual(["Cebu"]);
    expect(projectAddressPath(reference, cebuPath)).toMatchObject({
      groupId: "visayas", areaId: "0702200000", localityCode: "0730600000", barangayCode: "0730600041",
    });
    expect(cebuPath.map(n => n.code)).toEqual(["0700000000", "0730600000", "0730600041"]);
  });
  it("keeps independent cities accessible and projects NCR without a province", () => {
    const other = area("0739900000", "Independent fixture", "city", "0700000000");
    expect(provinceAreaChoices({...reference, nodes: [...reference.nodes, other]}, "visayas").map(c => c.label)).toEqual(["Cebu", "Independent fixture"]);
    expect(projectAddressPath(reference, [reference.nodes[6], reference.nodes[10]])).toMatchObject({ groupId: "metro-manila", localityCode: "1381700000" });
  });
  it("rejects duplicate, dangling, cyclic and wrongly typed reference parents", () => {
    expect(addressReferenceSchema.safeParse(reference).success).toBe(true);
    for (const nodes of [
      [...reference.nodes, reference.nodes[0]],
      [area("0702200000", "Cebu", "province", "9900000000")],
      [area("0702200000", "Cebu", "province", "0702200000")],
      [...reference.nodes, area("0702202000", "Bad", "province", "0730600000")],
    ]) expect(addressReferenceSchema.safeParse({...reference, nodes}).success).toBe(false);
  });
});
