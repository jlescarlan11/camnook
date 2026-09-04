"use client";

import { useActionState, useState } from "react";

import { PsgcAreaSelector } from "@/features/locations/psgc-area-selector";

import {
  saveCameraHandoffPolicy,
  type SaveHandoffPolicyState,
} from "./handoff-actions";
import type { AdminHandoffPolicy } from "./handoff-types";

const initialSaveState: SaveHandoffPolicyState = { status: "idle" };
const weekdayLabels = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function HandoffPolicyForm({ policy }: { policy: AdminHandoffPolicy }) {
  const [saveState, saveAction, savePending] = useActionState(
    saveCameraHandoffPolicy,
    initialSaveState,
  );
  const [canonicalAreaType, setCanonicalAreaType] = useState<"barangay" | null>(null);
  const [canonicalSelectionChanged, setCanonicalSelectionChanged] = useState(false);
  const version =
    saveState.status === "success" && saveState.version !== undefined
      ? saveState.version
      : policy.version;
  const canonicalReady = canonicalSelectionChanged && canonicalAreaType === "barangay";
  const canSave = canonicalSelectionChanged
    ? canonicalReady
    : Boolean(policy.canonicalAnchor?.active && policy.canonicalAnchor.current);

  return (
    <div className="mt-8 space-y-7">
      <form action={saveAction} className="space-y-7">
        <input name="cameraId" type="hidden" value={policy.cameraId} />
        <input name="expectedVersion" type="hidden" value={version} />
        <section
          aria-describedby={saveState.fieldErrors?.city ? "origin-error" : undefined}
          className="rounded-2xl border border-stone-200 p-5"
        >
          <h2 className="text-lg font-semibold">Pickup area</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Choose the general area where you can hand off this camera. No street
            or home address is stored.
          </p>
          <div className="mt-4">
            <PsgcAreaSelector
              initialPath={policy.canonicalAnchor?.areaPath}
              name={canonicalSelectionChanged ? "psgcAreaCode" : "preservedPsgcAreaCode"}
              onSelectionChange={(selection) => {
                setCanonicalSelectionChanged(true);
                setCanonicalAreaType(selection?.type === "barangay" ? "barangay" : null);
              }}
            />
          </div>
          {policy.canonicalAnchor ? (
            policy.canonicalAnchor.active && policy.canonicalAnchor.current ? (
              <p className="mt-3 text-sm text-stone-600">Saved area: {policy.canonicalAnchor.areaName}.</p>
            ) : (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
                Saved area: {policy.canonicalAnchor.areaName}. Choose the area again before making this camera available.
              </p>
            )
          ) : policy.cityLabel ? <p className="mt-3 text-sm text-stone-600">Saved area: {policy.cityLabel}.</p> : null}
          <FieldError id="origin-error" message={saveState.fieldErrors?.city} />
        </section>

        <fieldset className="rounded-2xl border border-stone-200 p-5">
          <legend className="px-2 text-lg font-semibold">
            Available days and times
          </legend>
          <p className="text-sm text-stone-600">
            Timezone: Asia/Manila (UTC+08:00)
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {weekdayLabels.map((label, value) => (
              <label
                className="flex min-h-11 items-center gap-3 rounded-xl border border-stone-200 px-3 py-2"
                key={label}
              >
                <input
                  defaultChecked={policy.allowedWeekdays.includes(value)}
                  name="weekdays"
                  type="checkbox"
                  value={value}
                />
                {label}
              </label>
            ))}
          </div>
          <FieldError
            id="weekdays-error"
            message={saveState.fieldErrors?.weekdays}
          />

          <label
            className="mt-5 block text-sm font-medium"
            htmlFor="approvedTimes"
          >
            Handoff times
          </label>
          <textarea
            aria-describedby={
              saveState.fieldErrors?.approvedTimes
                ? "approved-times-error"
                : "approved-times-help"
            }
            aria-invalid={Boolean(saveState.fieldErrors?.approvedTimes)}
            className="mt-2 min-h-28 w-full rounded-xl border border-stone-300 px-4 py-3 font-mono"
            defaultValue={policy.approvedTimes.join("\n")}
            id="approvedTimes"
            name="approvedTimes"
            placeholder={"09:00\n17:00"}
          />
          <p className="mt-2 text-xs text-stone-500" id="approved-times-help">
            Enter unique 24-hour values as HH:MM, separated by lines, spaces, or
            commas.
          </p>
          <FieldError
            id="approved-times-error"
            message={saveState.fieldErrors?.approvedTimes}
          />

          <label className="mt-5 flex items-start gap-3 rounded-xl bg-stone-50 p-4">
            <input
              defaultChecked={policy.enabled}
              className="mt-1"
              name="enabled"
              type="checkbox"
            />
            <span>
              <span className="block font-medium">Make these times available to renters</span>
              <span className="mt-1 block text-sm text-stone-600">
                Renters can choose only these days and times.
              </span>
            </span>
          </label>
        </fieldset>

        {saveState.status !== "idle" ? (
          <div
            aria-live="polite"
            className={`rounded-xl border p-4 text-sm ${saveState.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}
            role={saveState.status === "success" ? "status" : "alert"}
          >
            {saveState.status === "success"
              ? `Availability saved for ${saveState.cityLabel}.`
              : saveState.error === "stale"
                ? "Another save changed this policy. Reload before applying your changes."
                : saveState.error === "unauthorized"
                  ? "Your owner access could not be verified."
                  : saveState.error === "invalid_input"
                    ? "Correct the highlighted fields and try again."
                    : "The policy could not be saved. No partial settings were applied."}
          </div>
        ) : null}

        <button
          className="min-h-12 rounded-xl bg-stone-950 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={savePending || !canSave}
          type="submit"
        >
        {savePending ? "Saving availability…" : "Save availability"}
        </button>
      </form>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p className="mt-2 text-sm text-red-700" id={id} role="alert">
      {message}
    </p>
  ) : null;
}
