import type { AddressReference, PsgcChoice } from "./types";

export const area = (code: string, name: string, type: PsgcChoice["type"], parentCode: string | null) => ({
  code, name, type, parentCode, has_children: type !== "barangay",
  city_class: type === "city" ? "HUC" as const : null,
});
export const reference: AddressReference = {
  release: "2026-q2",
  nodes: [
    area("0700000000", "Region VII (Central Visayas)", "region", null),
    area("0702200000", "Cebu", "province", "0700000000"),
    area("0730600000", "City of Cebu", "city", "0700000000"),
    area("0731100000", "City of Lapu-Lapu", "city", "0700000000"),
    area("0731300000", "City of Mandaue", "city", "0700000000"),
    area("0702201000", "Alcantara", "municipality", "0702200000"),
    area("1300000000", "National Capital Region (NCR)", "region", null),
    area("1380600000", "City of Manila", "city", "1300000000"),
    area("1380602000", "Binondo", "submunicipality", "1380600000"),
    area("1380603000", "Quiapo", "submunicipality", "1380600000"),
    area("1381700000", "Pateros", "municipality", "1300000000"),
  ],
};
export const lahug = area("0730600041", "Lahug", "barangay", "0730600000");
export const cebuPath = [reference.nodes[0], reference.nodes[2], lahug].map(({code,name,type}) => ({code,name,type}));
export const children = (parent: string) => ({
  release: reference.release,
  choices: parent === "0730600000" ? [lahug] : reference.nodes.filter(n => n.parentCode === parent),
});
