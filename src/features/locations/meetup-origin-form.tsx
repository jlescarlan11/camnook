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
        <p className="mt-1 text-sm">{origin.valid ? "Saved default address · ready for booking suggestions" : "Saved default address · choose it again to refresh the official area"}</p>
      </div> : <p className="rounded-xl bg-stone-50 p-4 text-sm text-stone-600">No default address saved yet.</p>}
      <form action={saveAction} className="space-y-4">
        <PsgcAreaSelector />
        <p className="text-sm leading-6 text-stone-600">CamNook stores the selected barangay and its approximate center as your private default. Your house number and street are not requested or stored.</p>
        {saveState.status === "error" ? <p className="text-sm text-red-800" role="alert">{saveState.error === "invalid" ? "Choose a current barangay." : saveState.error === "provider" ? "The barangay center is unavailable. Retry without losing your selection." : "The default could not be saved. Your previous default is unchanged."}</p> : null}
        {saveState.status === "success" ? <p className="text-sm text-emerald-900" role="status">Default address saved.</p> : null}
        <button className="min-h-11 rounded-xl bg-stone-950 px-4 py-2 font-semibold text-white disabled:opacity-60" disabled={savePending} type="submit">{savePending ? "Saving address…" : "Save default address"}</button>
      </form>
      {origin ? <form action={removeAction}>
        <button className="min-h-11 rounded-xl border border-stone-900 px-4 py-2 font-semibold disabled:opacity-60" disabled={removePending} type="submit">{removePending ? "Removing…" : "Remove default address"}</button>
        {removeState.status === "error" ? <p className="mt-2 text-sm text-red-800" role="alert">The saved default could not be removed.</p> : null}
      </form> : null}
    </div>
  );
}
