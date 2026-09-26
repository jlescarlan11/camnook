"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState } from "react";

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
  addressEditRevision = 0,
  suggestedPin,
  onManualPinChange,
  mapInvalidationKey = 0,
}: {
  addressChanged: boolean;
  draftKey?: string;
  error?: string;
  initialPin: KycProfile["residentialPin"];
  addressEditRevision?: number;
  suggestedPin?: {requestId:number;pin:DraftPin};
  onManualPinChange?: ()=>void;
  mapInvalidationKey?: number;
}) {
  const initial = initialPin ? {
    accuracyMeters: initialPin.accuracyMeters,
    label: "Saved residential pin",
    latitude: initialPin.latitude,
    longitude: initialPin.longitude,
    source: initialPin.source,
  } satisfies DraftPin : null;
  const [restored] = useState(() => readCheckoutDraft<{ selected: DraftPin | null; draft: DraftPin | null; operation: "keep" | "remove" | "set"; confirmedRevision?:number }>(draftKey));
  const [selected, setSelected] = useState<DraftPin | null>(restored?.selected ?? initial);
  const [draft, setDraft] = useState<DraftPin | null>(restored?.draft ?? initial);
  const [operation, setOperation] = useState<"keep" | "remove" | "set">(restored?.operation ?? "keep");
  const [open, setOpen] = useState(!initialPin);
  const [confirmedRevision,setConfirmedRevision] = useState(restored?.confirmedRevision ?? 0);
  const [dismissedSuggestion,setDismissedSuggestion] = useState<number | null>(null);
  const hasSuggestion = Boolean(suggestedPin && suggestedPin.requestId !== dismissedSuggestion);
  const activeDraft = hasSuggestion ? suggestedPin!.pin : draft;
  const draftChanged = JSON.stringify(activeDraft) !== JSON.stringify(selected);
  const editorOpen = open || hasSuggestion || draftChanged;
  const confirmationCurrent = operation === "set" && confirmedRevision === addressEditRevision && !draftChanged && !hasSuggestion;
  const needsConfirmation = Boolean(activeDraft && (hasSuggestion || draftChanged ||
    (operation === "set" && !confirmationCurrent) || (addressChanged && initialPin && operation === "keep")));
  const submittedOperation = confirmationCurrent ? "set" : "keep";
  useEffect(() => {
    writeCheckoutDraft(draftKey, { selected, draft:activeDraft, operation, confirmedRevision: hasSuggestion ? -1 : confirmedRevision });
  }, [draftKey, selected, activeDraft, operation, confirmedRevision, hasSuggestion]);
  const trigger = useRef<HTMLButtonElement>(null);
  const editorId = useId();
  const wasOpen = useRef(editorOpen);
  useEffect(() => {
    if (wasOpen.current && !editorOpen) trigger.current?.focus();
    wasOpen.current = editorOpen;
  }, [editorOpen]);
  const descriptionIds = [
    needsConfirmation ? "residential-pin-reconfirmation" : undefined,
    error ? "residential-pin-error" : undefined,
  ].filter(Boolean).join(" ") || undefined;

  return (
    <section aria-describedby={descriptionIds} aria-labelledby="residential-pin-heading" className="rounded-xl border border-stone-200 p-4">
      <input name="pinOperation" type="hidden" value={submittedOperation} />
      <input name="pinConfirmationRequired" type="hidden" value={needsConfirmation ? "1" : "0"} />
      <input name="savedPinPresent" type="hidden" value={initialPin ? "1" : "0"} />
      <input name="pinLatitude" type="hidden" value={confirmationCurrent && selected ? selected.latitude : ""} />
      <input name="pinLongitude" type="hidden" value={confirmationCurrent && selected ? selected.longitude : ""} />
      <input name="pinSource" type="hidden" value={confirmationCurrent && selected ? selected.source : ""} />
      <input name="pinAccuracyMeters" type="hidden" value={confirmationCurrent && selected?.accuracyMeters ? selected.accuracyMeters : ""} />

      <h3 className="font-semibold" id="residential-pin-heading">Residential map pin <span className="font-normal text-stone-500">(required)</span></h3>
      <p className="mt-1 text-sm text-stone-600">Private and not included in your contract.</p>

      {selected && operation !== "remove" ? (
        <p className="mt-3 text-sm" role="status">
          Pin selected at {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}.
        </p>
      ) : <p className="mt-3 text-sm text-stone-500">No residential pin selected.</p>}
      {needsConfirmation ? (
          <p className="mt-2 text-sm text-amber-800" id="residential-pin-reconfirmation" role="alert">{operation === "keep" && initialPin ? "Your written address changed. Reconfirm the saved pin before saving." : "Your address or map pin changed. Confirm this pin before saving."}</p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-700" id="residential-pin-error" role="alert">{error}</p> : null}

      {!editorOpen ? <div className="mt-3 flex flex-wrap gap-3">
        <button className="min-h-11 rounded-xl border border-stone-300 px-4 py-2 font-medium"
          ref={trigger} aria-expanded={editorOpen} aria-controls={editorOpen ? editorId : undefined}
          onClick={() => { onManualPinChange?.(); setDraft(selected); setOpen(true); }} type="button">
          {selected && operation !== "remove" ? "Adjust map pin" : "Add map pin"}
        </button>
      </div> : null}
      {editorOpen ? <div className="mt-4 space-y-3" id={editorId}>
        <ResidentialMap
          invalidationKey={mapInvalidationKey}
          onInteractionStart={onManualPinChange}
          initialPin={activeDraft}
          mapKey={process.env.NEXT_PUBLIC_GEOAPIFY_MAP_KEY ?? ""}
          onDraftChange={value=>{
            onManualPinChange?.();
            setDismissedSuggestion(suggestedPin?.requestId ?? null);
            setDraft(value);
            setConfirmedRevision(-1);
          }}
        />
        <div className="flex flex-wrap gap-3">
          <button
            className="min-h-11 rounded-xl bg-stone-950 px-4 py-2 font-semibold text-white disabled:opacity-60"
            disabled={!activeDraft}
            onClick={() => {
              if (!activeDraft) return;
              onManualPinChange?.();
              setSelected(activeDraft);
              setDraft(activeDraft);
              setDismissedSuggestion(suggestedPin?.requestId ?? null);
              setConfirmedRevision(addressEditRevision);
              setOperation("set");
              setOpen(false);
            }}
            type="button"
          >Confirm this pin</button>
          <button
            className="min-h-11 rounded-xl border border-stone-300 px-4 py-2 font-medium"
            onClick={() => {
              onManualPinChange?.();
              setDismissedSuggestion(suggestedPin?.requestId ?? null);
              setDraft(selected);
              setOpen(false);
            }}
            type="button"
          >Cancel</button>
        </div>
      </div> : null}
    </section>
  );
}
