import type { AddressGroupId, AddressPath, AddressReference } from "./types";

export const ADDRESS_GROUPS: ReadonlyArray<{ id: AddressGroupId; label: string; regions: readonly string[] }> = [
  { id: "metro-manila", label: "Metro Manila", regions: ["1300000000"] },
  { id: "north-luzon", label: "North Luzon", regions: ["0100000000", "0200000000", "0300000000", "1400000000"] },
  { id: "south-luzon", label: "South Luzon", regions: ["0400000000", "1700000000", "0500000000"] },
  { id: "visayas", label: "Visayas", regions: ["0600000000", "0700000000", "0800000000", "1800000000"] },
  { id: "mindanao", label: "Mindanao", regions: ["0900000000", "1000000000", "1100000000", "1200000000", "1600000000", "1900000000"] },
];
export const FRIENDLY_AREA_BY_LOCALITY: Readonly<Record<string, string>> = {
  "0730600000": "0702200000", "0731100000": "0702200000", "0731300000": "0702200000",
};
export function groupForRegion(regionCode: string): AddressGroupId | null {
  return ADDRESS_GROUPS.find(g => g.regions.includes(regionCode))?.id ?? null;
}
export function canonicalPath(reference: AddressReference, code: string): AddressPath {
  const byCode = new Map(reference.nodes.map(n => [n.code, n]));
  const path: AddressPath = [];
  let node = byCode.get(code);
  const visited = new Set<string>();
  while (node && !visited.has(node.code)) {
    visited.add(node.code);
    path.unshift({ code: node.code, name: node.name, type: node.type });
    node = node.parentCode ? byCode.get(node.parentCode) : undefined;
  }
  return path;
}
export type PresentationChoice = { id: string; label: string; kind: "province" | "independent-city" | "metro-manila"; canonicalCode: string };
export function provinceAreaChoices(reference: AddressReference, group: AddressGroupId): PresentationChoice[] {
  if (group === "metro-manila") return [{id: "1300000000", label: "Metro Manila", kind: "metro-manila", canonicalCode: "1300000000"}];
  return reference.nodes.filter(n =>
    groupForRegion(canonicalPath(reference, n.code)[0]?.code ?? "") === group &&
    (n.type === "province" || (["city", "municipality"].includes(n.type) &&
      reference.nodes.some(p => p.code === n.parentCode && p.type === "region") &&
      !reference.nodes.some(p => p.code === FRIENDLY_AREA_BY_LOCALITY[n.code]))),
  ).map(n => ({id: n.code, label: n.name, kind: n.type === "province" ? "province" as const : "independent-city" as const, canonicalCode: n.code}))
    .sort((a,b) => a.label.localeCompare(b.label));
}
export function projectAddressPath(reference: AddressReference, path: AddressPath) {
  const locality = path.find(n => n.type === "city" || n.type === "municipality");
  const groupId = groupForRegion(path[0]?.code ?? "");
  const alias = locality ? FRIENDLY_AREA_BY_LOCALITY[locality.code] : undefined;
  return {
    groupId,
    areaId: groupId === "metro-manila" ? "1300000000" :
      (alias && reference.nodes.some(n => n.code === alias) ? alias : path.find(n => n.type === "province")?.code ?? locality?.code ?? null),
    localityCode: locality?.code ?? null,
    districtCode: path.find(n => n.type === "submunicipality")?.code ?? null,
    barangayCode: path.find(n => n.type === "barangay")?.code ?? null,
  };
}
