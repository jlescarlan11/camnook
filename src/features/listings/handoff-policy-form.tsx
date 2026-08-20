"use client";

import { useActionState } from "react";

import {
  saveCameraHandoffPolicy,
  type SaveHandoffPolicyState,
} from "./handoff-actions";
import type { AdminHandoffPolicy } from "./handoff-types";

const initialState: SaveHandoffPolicyState = { status: "idle" };
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
  const [state, formAction, pending] = useActionState(
    saveCameraHandoffPolicy,
    initialState,
  );
  const version = state.status === "success" ? state.version : policy.version;

  return (
    <form action={formAction} className="mt-8 space-y-7">
      <input name="cameraId" type="hidden" value={policy.cameraId} />
      <input name="expectedVersion" type="hidden" value={version} />

      <fieldset className="rounded-2xl border border-stone-200 p-5">
        <legend className="px-2 text-lg font-semibold">Customer-facing city</legend>
        <label className="mt-2 block text-sm font-medium" htmlFor="cityLabel">
          City or municipality label
        </label>
        <input
          aria-describedby={state.fieldErrors?.cityLabel ? "city-label-error" : "city-label-help"}
          aria-invalid={Boolean(state.fieldErrors?.cityLabel)}
          className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3"
          defaultValue={policy.cityLabel}
          id="cityLabel"
          maxLength={120}
          name="cityLabel"
          required
        />
        <p className="mt-2 text-xs text-stone-500" id="city-label-help">
          This label is public. Do not enter a street or home address.
        </p>
        <FieldError id="city-label-error" message={state.fieldErrors?.cityLabel} />

        <label className="mt-5 block text-sm font-medium" htmlFor="providerCityId">
          Provider-neutral city identifier
        </label>
        <input
          aria-describedby={state.fieldErrors?.providerCityId ? "provider-id-error" : "provider-id-help"}
          aria-invalid={Boolean(state.fieldErrors?.providerCityId)}
          className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3"
          defaultValue={policy.providerCityId}
          id="providerCityId"
          maxLength={240}
          name="providerCityId"
          required
        />
        <p className="mt-2 text-xs text-stone-500" id="provider-id-help">
          Private operator data used by the server; never shown in the public catalog.
        </p>
        <FieldError id="provider-id-error" message={state.fieldErrors?.providerCityId} />

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium" htmlFor="latitude">
            Coarse latitude
            <input
              aria-describedby={state.fieldErrors?.coordinates ? "coordinates-error" : undefined}
              aria-invalid={Boolean(state.fieldErrors?.coordinates)}
              className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3"
              defaultValue={policy.latitude ?? ""}
              id="latitude"
              name="latitude"
              required
              step="0.00001"
              type="number"
            />
          </label>
          <label className="text-sm font-medium" htmlFor="longitude">
            Coarse longitude
            <input
              aria-describedby={state.fieldErrors?.coordinates ? "coordinates-error" : undefined}
              aria-invalid={Boolean(state.fieldErrors?.coordinates)}
              className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3"
              defaultValue={policy.longitude ?? ""}
              id="longitude"
              name="longitude"
              required
              step="0.00001"
              type="number"
            />
          </label>
        </div>
        <FieldError id="coordinates-error" message={state.fieldErrors?.coordinates} />
      </fieldset>

      <fieldset className="rounded-2xl border border-stone-200 p-5">
        <legend className="px-2 text-lg font-semibold">Philippine-time handoffs</legend>
        <p className="text-sm text-stone-600">Timezone: Asia/Manila (UTC+08:00)</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {weekdayLabels.map((label, value) => (
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-stone-200 px-3 py-2" key={label}>
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
        <FieldError id="weekdays-error" message={state.fieldErrors?.weekdays} />

        <label className="mt-5 block text-sm font-medium" htmlFor="approvedTimes">
          Approved handoff times
        </label>
        <textarea
          aria-describedby={state.fieldErrors?.approvedTimes ? "approved-times-error" : "approved-times-help"}
          aria-invalid={Boolean(state.fieldErrors?.approvedTimes)}
          className="mt-2 min-h-28 w-full rounded-xl border border-stone-300 px-4 py-3 font-mono"
          defaultValue={policy.approvedTimes.join("\n")}
          id="approvedTimes"
          name="approvedTimes"
          placeholder={"09:00\n17:00"}
        />
        <p className="mt-2 text-xs text-stone-500" id="approved-times-help">
          Enter unique 24-hour values as HH:MM, separated by lines, spaces, or commas.
        </p>
        <FieldError id="approved-times-error" message={state.fieldErrors?.approvedTimes} />

        <label className="mt-5 flex items-start gap-3 rounded-xl bg-stone-50 p-4">
          <input defaultChecked={policy.enabled} className="mt-1" name="enabled" type="checkbox" />
          <span>
            <span className="block font-medium">Enable this handoff policy</span>
            <span className="mt-1 block text-sm text-stone-600">
              Enabled schedules can be published to renters after the dependent calendar feature is activated.
            </span>
          </span>
        </label>
      </fieldset>

      {state.status !== "idle" ? (
        <div
          aria-live="polite"
          className={`rounded-xl border p-4 text-sm ${state.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}
          role={state.status === "success" ? "status" : "alert"}
        >
          {state.status === "success"
            ? `Handoff policy version ${state.version} saved. Reloaded views will use this authoritative version.`
            : state.error === "stale"
              ? "Another save changed this policy. Reload before applying your changes."
              : state.error === "unauthorized"
                ? "Your administrator authorization could not be verified."
                : state.error === "invalid_input"
                  ? "Correct the highlighted fields and try again."
                  : "The policy could not be saved. No partial settings were applied."}
        </div>
      ) : null}

      <button
        className="min-h-12 rounded-xl bg-stone-950 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving policy…" : "Save handoff policy"}
      </button>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p className="mt-2 text-sm text-red-700" id={id} role="alert">
      {message}
    </p>
  ) : null;
}
