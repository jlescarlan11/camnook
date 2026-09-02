"use client";

import { useEffect, useId, useState } from "react";

import type { PsgcChoice } from "./types";

type Selection = { code: string; name: string; type: PsgcChoice["type"] };
const EMPTY_PATH: Selection[] = [];

export function psgcLevelLabel(index: number, choices: PsgcChoice[]) {
  if (index === 0) return "Region";
  const types = new Set(choices.map((choice) => choice.type));
  if (types.has("province") && types.has("city")) return "Province or independent city";
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
          const selected = initialPath[index]?.code ?? "";
          loaded.push({ choices: payload.choices, selected });
          if (!selected) break;
          parent = selected;
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
    const current = levels[levelIndex];
    const selected = current?.choices.find((choice) => choice.code === code) ?? null;
    const next = levels.slice(0, levelIndex + 1);
    next[levelIndex] = { ...current, selected: code };
    setLevels(next);
    onSelectionChange?.(selected ? { code: selected.code, name: selected.name, type: selected.type } : null, release);
    if (!selected?.has_children) return;
    setStatus("loading");
    try {
      const response = await fetch(`/api/locations/psgc?parent=${selected.code}`, { cache: "no-store" });
      if (!response.ok) throw new Error("reference unavailable");
      const payload = await response.json() as { choices: PsgcChoice[]; release: string };
      setLevels([...next, { choices: payload.choices, selected: "" }]);
      setRelease(payload.release);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  const selectedCode = [...levels].reverse().find((level) => level.selected)?.selected ?? "";

  return (
    <fieldset aria-describedby={`${id}-status`} className="space-y-3">
      <legend className="text-sm font-medium">Philippine administrative area</legend>
      <input name={name} type="hidden" value={selectedCode} />
      <input name="psgcRelease" type="hidden" value={release ?? ""} />
      {levels.map((level, index) => (
        <label className="block" key={`${index}-${level.choices[0]?.type ?? "area"}`}>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">
            {psgcLevelLabel(index, level.choices)}
          </span>
          <select
            className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2"
            onChange={(event) => void select(index, event.target.value)}
            value={level.selected}
          >
            <option value="">Select…</option>
            {level.choices.map((choice) => <option key={choice.code} value={choice.code}>{choice.name}</option>)}
          </select>
        </label>
      ))}
      <p aria-live="polite" className="text-sm text-stone-600" id={`${id}-status`} role={status === "error" ? "alert" : "status"}>
        {status === "loading" ? "Loading valid areas…" : status === "error" ? "Area choices could not be loaded. Retry by reloading this page." : selectedCode ? "Canonical area selected." : "Choose each applicable level. Independent cities do not require a province."}
      </p>
    </fieldset>
  );
}
