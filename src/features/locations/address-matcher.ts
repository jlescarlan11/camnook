import { canonicalPath, FRIENDLY_AREA_BY_LOCALITY } from "./address-presentation";
import type { AddressLocationResult, AddressPath, AddressReference, PsgcChoice } from "./types";

export type AdministrativeHints = {
  countryCode: string; city?: string; municipality?: string; state?: string; county?: string;
  suburb?: string; village?: string; district?: string; label?: string; distanceMeters?: number;
};
type Readers = {
  listChildren: (parent: string) => Promise<{ release: string; choices: PsgcChoice[] }>;
  resolveArea: (release: string, code: string) => Promise<{ release: string; active: boolean; current: boolean; path: AddressPath }>;
};
function normalized(name: string, type: PsgcChoice["type"]) {
  let value = name.normalize("NFKC").toLocaleLowerCase("en").trim().replace(/\s+/g, " ");
  if (type === "city" || type === "municipality") value = value.replace(/^(?:city|municipality) of /, "").replace(/ city$/, "");
  if (type === "barangay") value = value.replace(/^(?:barangay|brgy\.?)\s+/, "");
  return value;
}
function matches(node: AddressPath[number], hint: string) {
  return normalized(node.name, node.type) === normalized(hint, node.type);
}
function commonPath(paths: AddressPath[]): AddressPath {
  return (paths[0] ?? []).filter((node, index) => paths.every(path => path[index]?.code === node.code));
}
export async function matchAddressAreas({
  hints, accuracyMeters, reference, listChildren, resolveArea,
}: Readers & { hints: AdministrativeHints; accuracyMeters: number; reference: AddressReference }): Promise<AddressLocationResult> {
  if (hints.countryCode !== "PH") throw new Error("outside_philippines");
  const finish = async (path: AddressPath, reason: AddressLocationResult["reason"]): Promise<AddressLocationResult> => {
    if (path.length) {
      const resolved = await resolveArea(reference.release, path.at(-1)!.code);
      if (resolved.release !== reference.release || !resolved.active || !resolved.current ||
        JSON.stringify(resolved.path) !== JSON.stringify(path)) throw new Error("reference_unavailable");
    }
    return {countryCode: "PH", release: reference.release, path, reason,
      outcome: !path.length ? "unmatched" : path.at(-1)?.type === "barangay" ? "complete" : "partial"};
  };
  const ancestors = reference.nodes.filter(n => n.type === "region" || n.type === "province");
  const contexts = [hints.state, hints.county].filter((h): h is string => Boolean(h))
    .map(h => ancestors.filter(n => matches(n, h))).filter(group => group.length);
  const compatible = (path: AddressPath, localityCode?: string) => contexts.every(group =>
    group.some(n => path.some(p => p.code === n.code) || n.code === FRIENDLY_AREA_BY_LOCALITY[localityCode ?? ""]));
  const localityHints = [hints.city, hints.municipality].filter((h): h is string => Boolean(h));
  const localities = reference.nodes.filter(n => n.type === "city" || n.type === "municipality");
  const recognizedLocalities = localityHints.map(h => localities.filter(n => matches(n, h))).filter(group => group.length);
  const candidates = localities.filter(n => recognizedLocalities.length &&
    recognizedLocalities.every(group => group.some(c => c.code === n.code)) &&
    compatible(canonicalPath(reference, n.code), n.code));
  if (candidates.length !== 1) {
    if (candidates.length > 1) return finish(commonPath(candidates.map(n => canonicalPath(reference, n.code))), "ambiguous");
    // A recognized city that conflicts with context cannot fall back to that context as fact.
    if (recognizedLocalities.length) return finish([], "ambiguous");
    const known = contexts.flat().filter(n => compatible(canonicalPath(reference, n.code)));
    const deepest = known.filter(n => !known.some(other => other.code !== n.code &&
      canonicalPath(reference, other.code).some(p => p.code === n.code)));
    return finish(commonPath(deepest.map(n => canonicalPath(reference, n.code))), "unrecognized");
  }
  const locality = candidates[0];
  const path = canonicalPath(reference, locality.code);
  if (accuracyMeters > 1000 || (hints.distanceMeters ?? 0) > 1000) return finish(path, "low_accuracy");
  const getChildren = async (code: string) => {
    const result = await listChildren(code);
    if (result.release !== reference.release) throw new Error("reference_unavailable");
    return result.choices;
  };
  const localChildren = await getChildren(locality.code);
  let districts = localChildren.filter(n => n.type === "submunicipality");
  const districtMatches = hints.district ? districts.filter(n => matches(n, hints.district!)) : [];
  if (districtMatches.length === 1) districts = districtMatches;
  if (districts.length > 14) throw new Error("reference_unavailable");
  const barangayHints = [hints.suburb, hints.village, hints.district].filter((h): h is string => Boolean(h));
  const paths: AddressPath[] = [];
  const collect = (choices: PsgcChoice[], parentPath: AddressPath) => {
    for (const node of choices.filter(n => n.type === "barangay")) {
      if (barangayHints.some(h => matches(node, h))) {
        paths.push([...parentPath, {code:node.code,name:node.name,type:node.type}]);
      }
    }
  };
  collect(localChildren, path);
  for (let i = 0; i < districts.length; i += 4) {
    await Promise.all(districts.slice(i, i + 4).map(async district => {
      collect(await getChildren(district.code), [...path, {code:district.code,name:district.name,type:district.type}]);
    }));
  }
  if (paths.length === 1) return finish(paths[0], "matched");
  const partial = districtMatches.length === 1 ? [...path, {code: districtMatches[0].code, name:districtMatches[0].name, type:districtMatches[0].type}] : path;
  return finish(paths.length > 1 ? commonPath(paths) : partial, paths.length ? "ambiguous" : "barangay_missing");
}
