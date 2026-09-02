"use client";

import { useActionState } from "react";

import { removeMeetupOrigin, saveMeetupOrigin, type MeetupOriginActionState } from "./actions";
import { PsgcAreaSelector } from "./psgc-area-selector";

const initialState: MeetupOriginActionState = { status: "idle" };

export function MeetupOriginForm({ origin }: { origin: null | { areaName: string; precision: string; valid: boolean } }) {
  const [saveState, saveAction, savePending] = useActionState(saveMeetupOrigin, initialState);
  const [removeState, removeAction, removePending] = useActionState(removeMeetupOrigin, initialState);
  return (
    <div className="mt-5 space-y-4">
      {origin ? <div className={`rounded-xl p-4 ${origin.valid ? "bg-emerald-50 text-emerald-950" : "bg-amber-50 text-amber-950"}`} role="status">
        <p className="font-semibold">{origin.areaName}</p>
        <p className="mt-1 text-sm">{origin.precision.replaceAll("_", " ")}{origin.valid ? " · ready for confirmation at checkout" : " · needs review before checkout"}</p>
      </div> : <p className="rounded-xl bg-stone-50 p-4 text-sm text-stone-600">No saved default. Device and one-time canonical-area choices remain available at checkout.</p>}
      <form action={saveAction} className="space-y-4">
        <PsgcAreaSelector />
        <p className="text-sm leading-6 text-stone-600">CamNook stores the selected area centroid as an approximate default. It is private and must be confirmed for each checkout.</p>
        {saveState.status === "error" ? <p className="text-sm text-red-800" role="alert">{saveState.error === "invalid" ? "Choose a current city, municipality, or barangay." : saveState.error === "provider" ? "The area centroid is unavailable. Retry without losing your selection." : "The default could not be saved. Your previous default is unchanged."}</p> : null}
        {saveState.status === "success" ? <p className="text-sm text-emerald-900" role="status">Default meetup origin saved.</p> : null}
        <button className="min-h-11 rounded-xl bg-stone-950 px-4 py-2 font-semibold text-white disabled:opacity-60" disabled={savePending} type="submit">{savePending ? "Saving default…" : "Save as my default"}</button>
      </form>
      {origin ? <form action={removeAction}>
        <button className="min-h-11 rounded-xl border border-stone-900 px-4 py-2 font-semibold disabled:opacity-60" disabled={removePending} type="submit">{removePending ? "Removing…" : "Remove saved default"}</button>
        {removeState.status === "error" ? <p className="mt-2 text-sm text-red-800" role="alert">The saved default could not be removed.</p> : null}
      </form> : null}
    </div>
  );
}
