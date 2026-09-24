"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { readCheckoutDraft, writeCheckoutDraft } from "./checkout-draft";

import type { KycProfile } from "./types";

const ResidentialMap = dynamic(
  () => import("./residential-map").then((module) => module.ResidentialMap),
  { loading: () => <p role="status">Loading map…</p>, ssr: false },
);

export type DraftPin = {
  accuracyMeters: number | null;
  label: string;
  latitude: number;
  longitude: number;
  source: "device_gps" | "map_pin";
};

export function ResidentialPinPicker({
  addressChanged,
  draftKey,
  error,
  initialPin,
}: {
  addressChanged: boolean;
  draftKey?: string;
  error?: string;
  initialPin: KycProfile["residentialPin"];
}) {
  const initial = initialPin ? {
    accuracyMeters: initialPin.accuracyMeters,
    label: "Saved residential pin",
    latitude: initialPin.latitude,
    longitude: initialPin.longitude,
    source: initialPin.source,
  } satisfies DraftPin : null;
  const [restored] = useState(() => readCheckoutDraft<{ selected: DraftPin | null; draft: DraftPin | null; operation: "keep" | "remove" | "set" }>(draftKey));
  const [selected, setSelected] = useState<DraftPin | null>(restored?.selected ?? initial);
  const [draft, setDraft] = useState<DraftPin | null>(restored?.draft ?? initial);
  const [operation, setOperation] = useState<"keep" | "remove" | "set">(restored?.operation ?? "keep");
  useEffect(() => {
    writeCheckoutDraft(draftKey, { selected, draft, operation });
  }, [draftKey, selected, draft, operation]);
  const needsConfirmation = Boolean(addressChanged && initialPin && operation === "keep");

  return (
    <section aria-labelledby="residential-pin-heading" className="rounded-xl border border-stone-200 p-4">
      <input name="pinOperation" type="hidden" value={operation} />
      <input name="savedPinPresent" type="hidden" value={initialPin ? "1" : "0"} />
      <input name="pinLatitude" type="hidden" value={operation === "set" && selected ? selected.latitude : ""} />
      <input name="pinLongitude" type="hidden" value={operation === "set" && selected ? selected.longitude : ""} />
      <input name="pinSource" type="hidden" value={operation === "set" && selected ? selected.source : ""} />
      <input name="pinAccuracyMeters" type="hidden" value={operation === "set" && selected?.accuracyMeters ? selected.accuracyMeters : ""} />

      <h3 className="font-semibold" id="residential-pin-heading">Residential map pin <span className="font-normal text-stone-500">(required)</span></h3>
      <p className="mt-1 text-sm text-stone-600">Private and not included in your contract.</p>

      {selected && operation !== "remove" ? (
        <p className="mt-3 text-sm" role="status">
          Pin selected at {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}.
        </p>
      ) : <p className="mt-3 text-sm text-stone-500">No residential pin selected.</p>}
      {needsConfirmation ? (
        <p className="mt-2 text-sm text-amber-800" role="alert">Your written address changed. Reconfirm the saved pin before saving.</p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}

      <div className="mt-4 space-y-3">
        <ResidentialMap
          initialPin={draft}
          mapKey={process.env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY ?? ""}
          onDraftChange={setDraft}
        />
        <div className="flex flex-wrap gap-3">
          <button
            className="min-h-11 rounded-xl bg-stone-950 px-4 py-2 font-semibold text-white disabled:opacity-60"
            disabled={!draft}
            onClick={() => {
              if (!draft) return;
              setSelected(draft);
              setOperation("set");
            }}
            type="button"
          >Confirm this pin</button>
          <button
            className="min-h-11 rounded-xl border border-stone-300 px-4 py-2 font-medium"
            onClick={() => setDraft(selected)}
            type="button"
          >Discard changes</button>
        </div>
      </div>
    </section>
  );
}
