"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { PsgcChoice } from "./types";

type Selection = { code: string; name: string; type: PsgcChoice["type"] };
const EMPTY_PATH: Selection[] = [];

// PSGC correctly places highly urbanized cities directly below their region.
// The address form presents these cities inside the geographic area people use
// in everyday addresses, while the submitted barangay code remains canonical.
const FRIENDLY_AREA_BY_LOCALITY: Readonly<Record<string, string>> = {
  "0730600000": "0702200000", // City of Cebu -> Cebu
  "0731100000": "0702200000", // City of Lapu-Lapu -> Cebu
  "0731300000": "0702200000", // City of Mandaue -> Cebu
};

function sortChoices(choices: PsgcChoice[]) {
  return [...choices].sort((left, right) =>
    left.name.localeCompare(right.name) || left.code.localeCompare(right.code),
  );
}

export function choicesForProvinceOrArea(choices: PsgcChoice[]) {
  return choices.filter((choice) => !FRIENDLY_AREA_BY_LOCALITY[choice.code]);
}

export function choicesForFriendlyArea(
  regionChoices: PsgcChoice[],
  areaCode: string,
  localityChoices: PsgcChoice[],
) {
  const aliases = regionChoices.filter(
    (choice) => FRIENDLY_AREA_BY_LOCALITY[choice.code] === areaCode,
  );
  return sortChoices(
    [...new Map([...localityChoices, ...aliases].map((choice) => [choice.code, choice])).values()],
  );
}

export function createLatestRequestGate() {
  let latest = 0;
  return {
    begin() {
      latest += 1;
      return latest;
    },
    isCurrent(request: number) {
      return request === latest;
    },
  };
}

export function psgcLevelLabel(index: number, choices: PsgcChoice[]) {
  if (index === 0) return "Region";
  const types = new Set(choices.map((choice) => choice.type));
  if (types.has("province") && types.has("city")) return "Province";
  if (types.size === 1 && types.has("province")) return "Province";
  if (types.size === 1 && types.has("barangay")) return "Barangay";
  if (types.size === 1 && types.has("submunicipality")) return "Submunicipality";
  return "City or municipality";
}

export function PsgcAreaSelector({
  initialPath = EMPTY_PATH,
  name = "psgcAreaCode",
  onSelectionChange,
}: {
  initialPath?: Selection[];
  name?: string;
  onSelectionChange?: (selection: Selection | null, release: string | null) => void;
}) {
  const id = useId();
  const activeRequest = useRef<AbortController | null>(null);
  const requestGate = useRef(createLatestRequestGate());
  const [levels, setLevels] = useState<Array<{ choices: PsgcChoice[]; selected: string }>>([]);
  const [release, setRelease] = useState<string | null>(null);
  const [status, setStatus] = useState<"error" | "loading" | "ready">("loading");

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const loaded: Array<{ choices: PsgcChoice[]; selected: string }> = [];
        let parent: string | null = null;
        let activeRelease: string | null = null;
        for (let index = 0; index <= initialPath.length; index += 1) {
          const response = await fetch(`/api/locations/psgc${parent ? `?parent=${parent}` : ""}`, { cache: "no-store" });
          if (!response.ok) throw new Error("reference unavailable");
          const payload = await response.json() as { choices: PsgcChoice[]; release: string };
          activeRelease = payload.release;
          if (payload.choices.length === 0) break;
          const selected = initialPath[index]?.code ?? "";
          loaded.push({ choices: payload.choices, selected });
          if (!selected) break;
          parent = selected;
        }
        const regionalChoices = loaded[1]?.choices ?? [];
        const officialAreaCode = loaded[1]?.selected ?? "";
        const friendlyAreaCode = FRIENDLY_AREA_BY_LOCALITY[officialAreaCode];
        if (friendlyAreaCode) {
          const response = await fetch(`/api/locations/psgc?parent=${friendlyAreaCode}`, {
            cache: "no-store",
          });
          if (!response.ok) throw new Error("reference unavailable");
          const payload = await response.json() as { choices: PsgcChoice[]; release: string };
          loaded.splice(
            1,
            1,
            { choices: regionalChoices, selected: friendlyAreaCode },
            {
              choices: choicesForFriendlyArea(
                regionalChoices,
                friendlyAreaCode,
                payload.choices,
              ),
              selected: officialAreaCode,
            },
          );
          activeRelease = payload.release;
        } else if (
          loaded[1]?.choices.some((choice) => choice.code === officialAreaCode && choice.type === "province")
          && loaded[2]
        ) {
          loaded[2] = {
            ...loaded[2],
            choices: choicesForFriendlyArea(
              regionalChoices,
              officialAreaCode,
              loaded[2].choices,
            ),
          };
        }
        if (!cancelled) {
          setLevels(loaded);
          setRelease(activeRelease);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    void loadInitial();
    return () => { cancelled = true; };
  }, [initialPath]);

  async function select(levelIndex: number, code: string) {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const request = requestGate.current.begin();
    const current = levels[levelIndex];
    const selected = current?.choices.find((choice) => choice.code === code) ?? null;
    const next = levels.slice(0, levelIndex + 1);
    next[levelIndex] = { ...current, selected: code };
    setLevels(next);
    onSelectionChange?.(selected ? { code: selected.code, name: selected.name, type: selected.type } : null, release);
    if (!selected?.has_children) {
      setStatus("ready");
      return;
    }
    setStatus("loading");
    try {
      const response = await fetch(`/api/locations/psgc?parent=${selected.code}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("reference unavailable");
      const payload = await response.json() as { choices: PsgcChoice[]; release: string };
      if (!requestGate.current.isCurrent(request)) return;
      const regionChoices = levelIndex === 1 ? current.choices : [];
      const choices = selected.type === "province"
        ? choicesForFriendlyArea(regionChoices, selected.code, payload.choices)
        : payload.choices;
      setLevels([...next, { choices, selected: "" }]);
      setRelease(payload.release);
      setStatus("ready");
    } catch (error) {
      if (
        requestGate.current.isCurrent(request) &&
        !(error instanceof DOMException && error.name === "AbortError")
      ) {
        setStatus("error");
      }
    }
  }

  const selectedArea = status === "ready"
    ? levels
        .flatMap((level) => level.choices)
        .find((choice) => levels.some((level) => level.selected === choice.code && choice.type === "barangay"))
    : undefined;
  const selectedCode = selectedArea?.code ?? "";

  return (
    <fieldset aria-describedby={`${id}-status`} className="space-y-3">
      <legend className="text-sm font-medium">Philippine address</legend>
      <input name={name} type="hidden" value={selectedCode} />
      <input name="psgcRelease" type="hidden" value={status === "ready" ? release ?? "" : ""} />
      {levels.map((level, index) => {
        const provinces = level.choices.filter((choice) => choice.type === "province");
        const independentCities = level.choices.filter((choice) =>
          choice.type === "city" || choice.type === "municipality",
        );
        const isMixedRegionLevel = provinces.length > 0 && independentCities.length > 0;
        if (isMixedRegionLevel) {
          const visibleChoices = choicesForProvinceOrArea(level.choices);
          const visibleProvinces = visibleChoices.filter((choice) => choice.type === "province");
          const visibleIndependentCities = visibleChoices.filter((choice) =>
            choice.type === "city" || choice.type === "municipality",
          );
          return (
            <label className="block" key={`${index}-province-or-area`}>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">Province or area</span>
              <select
                className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2"
                disabled={status === "loading"}
                onChange={(event) => void select(index, event.target.value)}
                value={level.selected}
              >
                <option value="">Select…</option>
                <optgroup label="Provinces and familiar areas">
                  {visibleProvinces.map((choice) => <option key={choice.code} value={choice.code}>{choice.name}</option>)}
                </optgroup>
                {visibleIndependentCities.length > 0 ? (
                  <optgroup label="Independent cities">
                    {visibleIndependentCities.map((choice) => <option key={choice.code} value={choice.code}>{choice.name}</option>)}
                  </optgroup>
                ) : null}
              </select>
            </label>
          );
        }
        return (
          <label className="block" key={`${index}-${level.choices[0]?.type ?? "area"}`}>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">
              {psgcLevelLabel(index, level.choices)}
            </span>
            <select
              className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2"
              disabled={status === "loading"}
              onChange={(event) => void select(index, event.target.value)}
              value={level.selected}
            >
              <option value="">Select…</option>
              {level.choices.map((choice) => <option key={choice.code} value={choice.code}>{choice.name}</option>)}
            </select>
          </label>
        );
      })}
      <p aria-live="polite" className="text-sm text-stone-600" id={`${id}-status`} role={status === "error" ? "alert" : "status"}>
        {status === "loading" ? "Loading valid areas…" : status === "error" ? "Area choices could not be loaded. Retry by reloading this page." : selectedCode ? "Barangay selected." : "Choose a region, province or area, city or municipality, and barangay."}
      </p>
    </fieldset>
  );
}
