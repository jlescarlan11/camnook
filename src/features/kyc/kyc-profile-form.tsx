"use client";

import Link from "next/link";
import { useActionState, useState, type FormEvent, type ReactNode } from "react";

import { PsgcAreaSelector } from "@/features/locations/psgc-area-selector";

import { saveKycProfile, type KycActionState } from "./actions";
import { ResidentialPinPicker } from "./residential-pin-picker";
import type { KycProfile } from "./types";

const initialState: KycActionState = { status: "idle" };
const inputClass = "mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-[#0b4f9c] focus:ring-4 focus:ring-[#c9dcfb]";

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
  const [addressChanged, setAddressChanged] = useState(false);
  const submitted = state.values;
  const legacyAddress = kyc?.addressFormatVersion === 1 ? kyc.addressLine1 : "";

  function trackAddressChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if ([
      "addressDetails", "building", "houseNumber", "legacyAddressLine1",
      "postalCode", "psgcAreaCode", "streetName",
    ].includes(target.name)) setAddressChanged(true);
  }

  return (
    <form action={action} className="mt-6 space-y-5" onChange={trackAddressChange}>
      <input name="returnTo" type="hidden" value={returnTo} />
      <input name="expectedAddressRevision" type="hidden" value={kyc?.addressRevision ?? ""} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field error={state.fieldErrors?.legalName} label="Full legal name">
          <input autoComplete="name" className={inputClass} defaultValue={submitted?.legalName ?? profile?.legalName ?? ""} maxLength={160} name="legalName" required />
        </Field>
        <Field error={state.fieldErrors?.birthDate} label="Birthdate">
          <input className={inputClass} defaultValue={submitted?.birthDate ?? kyc?.birthDate ?? ""} max={adultCutoff()} name="birthDate" required type="date" />
        </Field>
        <Field error={state.fieldErrors?.phone} label="Mobile number" help="Used for booking coordination. SMS verification is not required.">
          <input autoComplete="tel" className={inputClass} defaultValue={submitted?.phone ?? profile?.phone ?? ""} maxLength={32} minLength={7} name="phone" required type="tel" />
        </Field>
      </div>
      <div aria-describedby={state.fieldErrors?.psgcAreaCode ? "kyc-area-error" : undefined}>
        <PsgcAreaSelector initialPath={kyc?.path} />
        {state.fieldErrors?.psgcAreaCode ? <p className="mt-2 text-sm text-red-700" id="kyc-area-error" role="alert">{state.fieldErrors.psgcAreaCode}</p> : null}
      </div>
      <fieldset className="space-y-4 rounded-xl border border-stone-200 p-4">
        <legend className="px-1 font-semibold">Residential address details</legend>
        {legacyAddress ? (
          <Field error={state.fieldErrors?.legacyAddressLine1} help="This preserves your existing unsplit address until you add structured details." label="Existing address details">
            <input autoComplete="address-line1" className={inputClass} defaultValue={submitted?.legacyAddressLine1 ?? legacyAddress} maxLength={500} name="legacyAddressLine1" />
          </Field>
        ) : <input name="legacyAddressLine1" type="hidden" value="" />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field error={state.fieldErrors?.houseNumber} label="House or lot number (optional)">
            <input className={inputClass} defaultValue={submitted?.houseNumber ?? kyc?.houseNumber ?? ""} maxLength={80} name="houseNumber" />
          </Field>
          <Field error={state.fieldErrors?.streetName} help="Leave blank if your road has no official name." label="Street name (optional)">
            <input autoComplete="address-line1" className={inputClass} defaultValue={submitted?.streetName ?? kyc?.streetName ?? ""} maxLength={160} name="streetName" />
          </Field>
          <Field error={state.fieldErrors?.building} label="Building name (optional)">
            <input className={inputClass} defaultValue={submitted?.building ?? kyc?.building ?? ""} maxLength={160} name="building" />
          </Field>
          <Field error={state.fieldErrors?.postalCode} help="Enter the code used for your address; CamNook does not guess it from the barangay." label="Postal code (optional)">
            <input autoComplete="postal-code" className={inputClass} defaultValue={submitted?.postalCode ?? kyc?.postalCode ?? ""} maxLength={16} name="postalCode" />
          </Field>
        </div>
        <Field error={state.fieldErrors?.addressDetails} help="Use this for a subdivision, sitio, purok, floor/unit, landmark, or an unnamed road. At least one written-address field is required." label="Additional address details (optional)">
          <input autoComplete="address-line2" className={inputClass} defaultValue={submitted?.addressDetails ?? kyc?.addressDetails ?? ""} maxLength={200} name="addressDetails" />
        </Field>
      </fieldset>
      <ResidentialPinPicker
        addressChanged={addressChanged}
        error={state.fieldErrors?.residentialPin}
        initialPin={kyc?.residentialPin ?? null}
      />
      <p className="rounded-xl bg-stone-50 p-4 text-sm leading-6 text-stone-600">
        CamNook uses these details for renter eligibility, the rental contract, and equipment-loss prevention. Bring one original current government ID at pickup. We do not store its image or number.
        {" "}<Link className="font-semibold text-amber-900 underline" href="/privacy/government-id">Read the renter KYC notice.</Link>
      </p>
      {state.status === "error" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {state.error === "underage" ? "Renters must be at least 18 years old." : state.error === "suspended" ? "This account cannot complete KYC." : state.error === "unauthorized" ? "Sign in again to save your details." : state.error === "pin_reconfirmation" ? "Your address or pin changed. Reconfirm or remove the pin, or reload if you edited this profile elsewhere." : state.error === "save" ? "Your KYC details could not be saved. Please retry." : "Correct the highlighted KYC details."}
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
