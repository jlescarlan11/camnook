"use client";

import { startTransition, useActionState, useState, type ReactNode } from "react";

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

export function HandoffPolicyForm({ policy, children, continueToPreview = false }: { policy: AdminHandoffPolicy; children?: ReactNode; continueToPreview?: boolean }) {
  const [saveState, saveAction, savePending] = useActionState(
    saveCameraHandoffPolicy,
    initialSaveState,
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
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
      <form id="handoff-policy-form" className="space-y-7" onChange={() => setHasUnsavedChanges(true)} onSubmit={(event) => {
        event.preventDefault();
        if (savePending || !canSave) return;
        const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
        setHasUnsavedChanges(false);
        startTransition(() => saveAction(data));
      }}>
        <input name="cameraId" type="hidden" value={policy.cameraId} />
        <input name="expectedVersion" type="hidden" value={version} />
        <section className="rounded-xl border border-stone-200 p-5">
          <h2 className="text-lg font-semibold">Pickup area</h2>
          <div className="mt-4">
            <PsgcAreaSelector
              errorId={
                saveState.fieldErrors?.city ? "origin-error" : undefined
              }
              initialPath={policy.canonicalAnchor?.areaPath}
              invalid={Boolean(saveState.fieldErrors?.city)}
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

        <fieldset className="rounded-xl border border-stone-200 p-5">
          <legend className="px-2 text-lg font-semibold">
            Available days and times
          </legend>
          <p className="text-sm text-stone-600">Asia/Manila (UTC+08:00)</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {weekdayLabels.map((label, value) => (
              <label
                className="flex min-h-11 items-center gap-3 rounded-xl border border-stone-200 px-3 py-2"
                key={label}
              >
                <input
                  aria-describedby={
                    saveState.fieldErrors?.weekdays
                      ? "weekdays-error"
                      : undefined
                  }
                  aria-invalid={
                    saveState.fieldErrors?.weekdays ? true : undefined
                  }
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
                ? "approved-times-help approved-times-error"
                : "approved-times-help"
            }
            aria-invalid={
              saveState.fieldErrors?.approvedTimes ? true : undefined
            }
            className="mt-2 min-h-28 w-full rounded-xl border border-stone-300 px-4 py-3 font-mono"
            defaultValue={policy.approvedTimes.join("\n")}
            id="approvedTimes"
            name="approvedTimes"
            placeholder={"09:00\n17:00"}
          />
          <p className="mt-2 text-xs text-stone-500" id="approved-times-help">
            24-hour time, such as 09:00 or 17:00.
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
            </span>
          </label>
        </fieldset>

        {saveState.status === "success" && hasUnsavedChanges ? (
          <p className="text-sm text-stone-600" role="status">Unsaved changes.</p>
        ) : !savePending && saveState.status !== "idle" ? (
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
                    ? saveState.fieldErrors?.camera ?? "Correct the highlighted fields and try again."
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
      {children}
      {continueToPreview ? <button className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-stone-950 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={savePending || !canSave} form="handoff-policy-form" name="intent" value="continue" type="submit">{savePending ? "Saving availability…" : "Save availability and continue to preview"}</button> : null}
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
