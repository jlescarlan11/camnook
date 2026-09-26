import { describe, expect, it } from "vitest";
import { matchAddressAreas } from "./address-matcher";
import { area, cebuPath, children, lahug, reference } from "./address-fixtures.test-support";
import { canonicalPath } from "./address-presentation";
import type { AddressPath, AddressReference } from "./types";

function dependencies(ref: AddressReference = reference) {
  return {
    reference: ref,
    accuracyMeters: 20,
    listChildren: async (code: string) => children(code),
    resolveArea: async (release: string, code: string) => ({
      release, current: true, active: true,
      path: code === lahug.code ? cebuPath : canonicalPath(ref, code),
    }),
  };
}
describe("address matching", () => {
  it("fills Cebu City's official hierarchy from scoped names", async () => {
    const result = await matchAddressAreas({...dependencies(), hints: {countryCode: "PH", city: "Cebu City", county: "Cebu", suburb: "Brgy. Lahug"}});
    expect(result.outcome).toBe("complete");
    expect(result.path).toEqual(cebuPath);
  });
  it.each([{}, {suburb: "Unknown"}, {suburb: "Lahug", village: "Different"}])("keeps unresolved barangays editable: %j", async extra => {
    const result = await matchAddressAreas({...dependencies(), hints: {countryCode: "PH", city: "Cebu City", ...extra}});
    expect(result.outcome).toBe(extra.suburb === "Lahug" ? "complete" : "partial");
  });
  it("returns a province when the city is unavailable", async () => {
    const result = await matchAddressAreas({...dependencies(), hints: {countryCode: "PH", county: "Cebu"}});
    expect(result.path.map(n => n.code)).toEqual(["0700000000", "0702200000"]);
    expect(result.outcome).toBe("partial");
  });
  it("does not pick a duplicate city by a globally familiar barangay", async () => {
    const ref = {...reference, nodes: [...reference.nodes,
      area("0702202000", "Alcantara", "municipality", "0702200000")]};
    const result = await matchAddressAreas({...dependencies(ref), hints: {countryCode: "PH", municipality: "Alcantara", suburb: "Lahug"}});
    expect(result.reason).toBe("ambiguous");
    expect(result.path.at(-1)?.type).toBe("province");
  });
  it("does not accept contradictory recognized ancestors or city hints", async () => {
    for (const extra of [{state: "National Capital Region (NCR)"}, {municipality: "Pateros"}]) {
      const result = await matchAddressAreas({...dependencies(), hints: {countryCode: "PH", city: "Cebu City", suburb: "Lahug", ...extra}});
      expect(result.outcome).not.toBe("complete");
    }
  });
  it.each([{accuracyMeters: 1001}, {distance: 1001}])("caps coarse position at city: %j", async input => {
    const result = await matchAddressAreas({...dependencies(), accuracyMeters: input.accuracyMeters ?? 20,
      hints: {countryCode: "PH", city: "Cebu City", suburb: "Lahug", distanceMeters: input.distance}});
    expect(result.reason).toBe("low_accuracy");
    expect(result.path.at(-1)?.type).toBe("city");
  });
  it("matches Manila barangays under their actual district without guessing numbers", async () => {
    const barangay = area("1380602001", "Barangay 287", "barangay", "1380602000");
    const expected: AddressPath = [...canonicalPath(reference, "1380602000"), barangay].map(({code,name,type})=>({code,name,type}));
    const run = (suburb: string) => matchAddressAreas({...dependencies(),
      hints: {countryCode: "PH", city: "Manila", suburb},
      listChildren: async code => code === "1380602000" ? {release: reference.release, choices: [barangay]} : children(code),
      resolveArea: async (release, code) => ({release, active:true, current:true, path:code===barangay.code ? expected : canonicalPath(reference,code)}),
    });
    expect((await run("Brgy. 287")).path).toEqual(expected);
    expect((await run("Barangay 28")).outcome).toBe("partial");
  });
  it("rejects a release change instead of combining two hierarchies", async () => {
    await expect(matchAddressAreas({...dependencies(), hints:{countryCode:"PH",city:"Cebu City",suburb:"Lahug"},
      listChildren: async () => ({release:"2026-q3", choices:[lahug]})})).rejects.toThrow("reference");
  });
  it("rejects an inactive resolved path", async () => {
    await expect(matchAddressAreas({...dependencies(), hints:{countryCode:"PH",city:"Cebu City"},
      resolveArea:async()=>({release:reference.release,current:false,active:true,path:cebuPath.slice(0,2)})})).rejects.toThrow("reference");
  });
});
