"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";

import { PsgcAreaSelector } from "@/features/locations/psgc-area-selector";

import { saveKycProfile, type KycActionState } from "./actions";
import type { KycProfile } from "./types";

const initialState: KycActionState = { status: "idle" };
const inputClass = "mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-700 focus:ring-4 focus:ring-amber-100";

function adultCutoff() {
  const value = new Date();
  value.setFullYear(value.getFullYear() - 18);
  return value.toISOString().slice(0, 10);
}

export function KycProfileForm({
  kyc,
  profile,
  returnTo,
}: {
  kyc: KycProfile | null;
  profile: null | { legalName: string; phone: string };
  returnTo: string;
}) {
  const [state, action, pending] = useActionState(saveKycProfile, initialState);
  return (
    <form action={action} className="mt-6 space-y-5">
      <input name="returnTo" type="hidden" value={returnTo} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field error={state.fieldErrors?.legalName} label="Full legal name">
          <input autoComplete="name" className={inputClass} defaultValue={profile?.legalName ?? ""} maxLength={160} name="legalName" required />
        </Field>
        <Field error={state.fieldErrors?.birthDate} label="Birthdate">
          <input className={inputClass} defaultValue={kyc?.birthDate ?? ""} max={adultCutoff()} name="birthDate" required type="date" />
        </Field>
        <Field error={state.fieldErrors?.phone} label="Mobile number" help="Used for booking coordination. SMS verification is not required.">
          <input autoComplete="tel" className={inputClass} defaultValue={profile?.phone ?? ""} maxLength={32} minLength={7} name="phone" required type="tel" />
        </Field>
        <Field error={state.fieldErrors?.addressLine1} label="House/building and street">
          <input autoComplete="address-line1" className={inputClass} defaultValue={kyc?.addressLine1 ?? ""} maxLength={200} name="addressLine1" required />
        </Field>
      </div>
      <div aria-describedby={state.fieldErrors?.psgcAreaCode ? "kyc-area-error" : undefined}>
        <PsgcAreaSelector initialPath={kyc?.path} />
        {state.fieldErrors?.psgcAreaCode ? <p className="mt-2 text-sm text-red-700" id="kyc-area-error" role="alert">{state.fieldErrors.psgcAreaCode}</p> : null}
      </div>
      <p className="rounded-xl bg-stone-50 p-4 text-sm leading-6 text-stone-600">
        CamNook uses these details for renter eligibility, the rental contract, and equipment-loss prevention. Bring one original current government ID at pickup. We do not store its image or number.
        {" "}<Link className="font-semibold text-amber-900 underline" href="/privacy/government-id">Read the renter KYC notice.</Link>
      </p>
      {state.status === "error" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {state.error === "underage" ? "Renters must be at least 18 years old." : state.error === "suspended" ? "This account cannot complete KYC." : state.error === "unauthorized" ? "Sign in again to save your details." : state.error === "save" ? "Your KYC details could not be saved. Please retry." : "Correct the highlighted KYC details."}
        </p>
      ) : null}
      <button className="min-h-12 rounded-xl bg-stone-950 px-5 py-3 font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Saving KYC…" : kyc ? "Update KYC details" : "Save KYC details"}
      </button>
    </form>
  );
}

function Field({ children, error, help, label }: { children: ReactNode; error?: string; help?: string; label: string }) {
  return <label className="block text-sm font-medium">{label}{children}{help ? <span className="mt-2 block text-xs font-normal text-stone-500">{help}</span> : null}{error ? <span className="mt-2 block text-sm font-normal text-red-700" role="alert">{error}</span> : null}</label>;
}
