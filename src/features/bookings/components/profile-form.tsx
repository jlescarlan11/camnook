"use client";

import { useActionState, useState } from "react";

import { saveProfile } from "@/features/bookings/actions/profile";
import { initialProfileActionState } from "@/features/bookings/form-state";

export function ProfileForm({
  successMessage = "Profile saved. You can continue when the request form appears.",
}: {
  successMessage?: string;
}) {
  const [legalName, setLegalName] = useState("");
  const [phone, setPhone] = useState("");
  const [state, formAction, pending] = useActionState(
    saveProfile,
    initialProfileActionState,
  );

  return (
    <form action={formAction} className="mt-6 space-y-5">
      <div>
        <label className="block text-sm font-medium" htmlFor="legalName">
          Full legal name
        </label>
        <input
          aria-describedby={state.fieldErrors?.legalName ? "legal-name-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.legalName)}
          autoComplete="name"
          className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 text-base outline-none focus:border-amber-700 focus:ring-4 focus:ring-amber-100"
          id="legalName"
          maxLength={160}
          name="legalName"
          onChange={(event) => setLegalName(event.target.value)}
          required
          value={legalName}
        />
        {state.fieldErrors?.legalName ? (
          <p className="mt-2 text-sm text-red-700" id="legal-name-error" role="alert">
            {state.fieldErrors.legalName}
          </p>
        ) : null}
      </div>
      <div>
        <label className="block text-sm font-medium" htmlFor="phone">
          Phone number
        </label>
        <input
          aria-describedby={state.fieldErrors?.phone ? "phone-error" : undefined}
          aria-invalid={Boolean(state.fieldErrors?.phone)}
          autoComplete="tel"
          className="mt-2 w-full rounded-xl border border-stone-300 px-4 py-3 text-base outline-none focus:border-amber-700 focus:ring-4 focus:ring-amber-100"
          id="phone"
          maxLength={32}
          minLength={7}
          name="phone"
          onChange={(event) => setPhone(event.target.value)}
          required
          type="tel"
          value={phone}
        />
        {state.fieldErrors?.phone ? (
          <p className="mt-2 text-sm text-red-700" id="phone-error" role="alert">
            {state.fieldErrors.phone}
          </p>
        ) : null}
      </div>
      {state.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {state.error === "suspended"
            ? "This account is suspended and cannot submit requests. Contact CamNook for help."
            : state.error === "save_failed"
              ? "We couldn’t save your profile. Please try again."
              : "Correct the highlighted fields and try again."}
        </p>
      ) : null}
      {state.status === "success" ? (
        <p className="text-sm text-emerald-800" role="status">
          {successMessage}
        </p>
      ) : null}
      <button
        className="min-h-12 w-full rounded-xl bg-stone-950 px-5 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving profile…" : "Save profile"}
      </button>
      {pending ? (
        <span className="sr-only" role="status">
          Saving your profile.
        </span>
      ) : null}
    </form>
  );
}
