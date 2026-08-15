"use client";

import {
  cloneElement,
  useActionState,
  useEffect,
  useRef,
  type ReactElement,
} from "react";

import {
  supersedeContract,
  type SupersedeContractActionState,
} from "../admin-actions";

const initialState: SupersedeContractActionState = { status: "idle" };

export function SupersedeContractControl({
  bookingId,
  cameras,
  currentCameraId,
  pickup,
  returnValue,
}: {
  bookingId: string;
  cameras: { id: string; name: string }[];
  currentCameraId: string;
  pickup: string;
  returnValue: string;
}) {
  const [state, action, pending] = useActionState(
    supersedeContract,
    initialState,
  );
  const resultRef = useRef<HTMLDivElement>(null);
  const message = actionMessage(state, pending);

  useEffect(() => {
    if (state.status !== "idle") resultRef.current?.focus();
  }, [state]);

  return (
    <section
      aria-busy={pending}
      aria-labelledby="replace-contract-heading"
      className="mt-7 border-t border-stone-200 pt-7"
    >
      <h2 className="text-xl font-semibold" id="replace-contract-heading">
        Issue a material replacement
      </h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Changing the camera or schedule re-snapshots authoritative inclusions,
        pricing, deposit, and the active approved terms. The old agreement and
        signature stay immutable and non-actionable. The original deadline does
        not move.
      </p>
      <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2">
        <input name="bookingId" type="hidden" value={bookingId} />
        <Field label="Camera" error={state.fieldErrors?.camera} id="camera">
          <select
            className="mt-2 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-amber-800 focus:ring-4 focus:ring-amber-100"
            defaultValue={currentCameraId}
            disabled={pending}
            id="camera"
            name="camera"
            required
          >
            {cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="hidden sm:block" />
        <Field label="Pickup (Asia/Manila)" error={state.fieldErrors?.pickup} id="pickup">
          <input
            className="mt-2 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-amber-800 focus:ring-4 focus:ring-amber-100"
            defaultValue={pickup}
            disabled={pending}
            id="pickup"
            name="pickup"
            required
            type="datetime-local"
          />
        </Field>
        <Field label="Return (Asia/Manila)" error={state.fieldErrors?.return} id="return">
          <input
            className="mt-2 min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-amber-800 focus:ring-4 focus:ring-amber-100"
            defaultValue={returnValue}
            disabled={pending}
            id="return"
            name="return"
            required
            type="datetime-local"
          />
        </Field>
        <button
          className="min-h-12 rounded-xl bg-stone-900 px-5 py-3 font-semibold text-white transition hover:bg-stone-800 focus:outline-none focus:ring-4 focus:ring-stone-300 disabled:cursor-not-allowed disabled:opacity-55 sm:col-span-2"
          disabled={pending}
          type="submit"
        >
          {pending ? "Issuing replacement…" : "Issue replacement agreement"}
        </button>
      </form>
      {message ? (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm leading-6 ${
            state.status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : state.status === "indeterminate"
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : "border-red-200 bg-red-50 text-red-900"
          }`}
          ref={resultRef}
          role={state.status === "success" ? "status" : "alert"}
          tabIndex={-1}
        >
          {message}
        </div>
      ) : null}
    </section>
  );
}

function Field({
  children,
  error,
  id,
  label,
}: {
  children: ReactElement<{
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }>;
  error?: string;
  id: string;
  label: string;
}) {
  return (
    <div>
      <label className="font-semibold" htmlFor={id}>
        {label}
      </label>
      {cloneElement(children, {
        "aria-describedby": error ? `${id}-error` : undefined,
        "aria-invalid": Boolean(error),
      })}
      {error ? (
        <p
          className="mt-2 text-sm font-medium text-red-800"
          id={`${id}-error`}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function actionMessage(state: SupersedeContractActionState, pending: boolean) {
  if (pending) return "Rechecking authoritative values and issuing the replacement…";
  if (state.status === "success") return "Replacement agreement issued. Reloading persisted history…";
  if (state.error === "availability") return "That camera is no longer available for the selected schedule. Refresh and choose again.";
  if (state.error === "no_change") return "No material value changed, so no replacement was created.";
  if (state.error === "stale") return "This booking, deadline, or agreement changed. Refresh before trying again.";
  if (state.error === "unauthorized") return "Administrator authorization is required.";
  if (state.error === "invalid_input") return "Correct the highlighted replacement details.";
  if (state.status === "indeterminate") return "The result could not be confirmed. Refresh before retrying.";
  return null;
}
