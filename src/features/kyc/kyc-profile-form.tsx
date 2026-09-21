"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@radix-ui/react-icons";
import { CheckoutProgress } from "@/features/bookings/components/checkout-progress";
import { useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

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
  checkout = false,
  initialStep = 1,
}: {
  checkout?: boolean;
  initialStep?: 1 | 2;
  kyc: KycProfile | null;
  profile: null | { legalName: string; phone: string };
  returnTo: string;
}) {
  const [step, setStep] = useState<1 | 2>(initialStep);
  const [state, action, pending] = useActionState(async (previous: KycActionState, data: FormData) => {
    const result = await saveKycProfile(previous, data);
    if (checkout && result.status === "error") {
      setStep(result.error === "underage" || result.fieldErrors?.legalName || result.fieldErrors?.birthDate || result.fieldErrors?.phone ? 1 : 2);
    }
    return result;
  }, initialState);
  const personalFields = useRef<HTMLDivElement>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current !== step) {
      previousStep.current = step;
      stepHeading.current?.focus();
    }
  }, [step]);

  function validateDetails() {
    const inputs = personalFields.current?.querySelectorAll("input") ?? [];
    for (const input of inputs) {
      if (!input.checkValidity()) {
        setStep(1);
        requestAnimationFrame(() => input.reportValidity());
        return false;
      }
    }
    return true;
  }
  const [addressChanged, setAddressChanged] = useState(false);
  const submitted = state.values;
  const legacyAddress = kyc?.addressFormatVersion === 1 ? kyc.addressLine1 : "";
  const initialStreetName = submitted?.streetName ?? kyc?.streetName ?? "";

  function trackAddressChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if ([
      "addressDetails", "building", "houseNumber", "legacyAddressLine1",
      "postalCode", "psgcAreaCode", "streetName",
    ].includes(target.name)) setAddressChanged(true);
  }

  return (
    <form action={action} className={checkout ? "checkout-kyc" : "mt-6 space-y-5"} onChange={trackAddressChange}
      noValidate={checkout} onSubmit={(event) => {
        if (!checkout) return;
        if (step === 1) {
          event.preventDefault();
          if (validateDetails()) setStep(2);
        } else if (!validateDetails() || !event.currentTarget.reportValidity()) event.preventDefault();
      }}>
      {checkout ? <>
        <CheckoutProgress step={step} onDetails={() => setStep(1)} />
        <h2 className="checkout-section-title" ref={stepHeading} tabIndex={-1}>{step === 1 ? "Your details" : "Your address"}</h2>
        <p className="checkout-section-intro">{step === 1 ? "Required for eligibility and your rental contract." : "Add your Philippine residence for your rental contract."}</p>
      </> : null}
      <input name="returnTo" type="hidden" value={returnTo} />
      <input name="expectedAddressRevision" type="hidden" value={kyc?.addressRevision ?? ""} />
      <div ref={personalFields} hidden={checkout && step !== 1} className={checkout ? "checkout-personal-fields" : "grid gap-5 sm:grid-cols-2"}>
        <Field error={state.fieldErrors?.legalName} label="Full legal name">
          <input autoComplete="name" className={inputClass} defaultValue={submitted?.legalName ?? profile?.legalName ?? ""} maxLength={160} name="legalName" minLength={2} placeholder={checkout ? "Enter your full legal name" : undefined} required />
        </Field>
        <Field error={state.fieldErrors?.birthDate} label="Birthdate">
          <input className={inputClass} defaultValue={submitted?.birthDate ?? kyc?.birthDate ?? ""} max={adultCutoff()} name="birthDate" required type="date" />
        </Field>
        <Field error={state.fieldErrors?.phone} label="Mobile number">
          <input autoComplete="tel" className={inputClass} defaultValue={submitted?.phone ?? profile?.phone ?? ""} maxLength={32} minLength={7} name="phone" placeholder={checkout ? "+63 9XX XXX XXXX" : undefined} required type="tel" />
        </Field>
      </div>
      <div hidden={checkout && step !== 2} className={checkout ? "checkout-address-fields" : "space-y-5"}>
        <div aria-describedby={state.fieldErrors?.psgcAreaCode ? "kyc-area-error" : undefined}>
          <PsgcAreaSelector initialPath={kyc?.path} />
          {state.fieldErrors?.psgcAreaCode ? <p className="mt-2 text-sm text-red-700" id="kyc-area-error" role="alert">{state.fieldErrors.psgcAreaCode}</p> : null}
        </div>
        <fieldset className="space-y-4 rounded-xl border border-stone-200 p-4">
          <legend className="px-1 font-semibold">Residential address details</legend>
          {legacyAddress ? (
            <Field error={state.fieldErrors?.legacyAddressLine1} help="For reference only. Complete the structured address fields below before saving." label="Existing address details">
              <input autoComplete="address-line1" className={inputClass} defaultValue={submitted?.legacyAddressLine1 ?? legacyAddress} maxLength={500} name="legacyAddressLine1" readOnly />
            </Field>
          ) : <input name="legacyAddressLine1" type="hidden" value="" />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field error={state.fieldErrors?.houseNumber} help="Required unless you provide both a building name and unit details." label="House or lot number">
              <input className={inputClass} defaultValue={submitted?.houseNumber ?? kyc?.houseNumber ?? ""} maxLength={80} name="houseNumber" placeholder="e.g. 12 or Lot 4 Block 2" />
            </Field>
            <Field error={state.fieldErrors?.streetName} help="Leave blank only when the road has no official name." label="Street name">
              <input autoComplete="address-line1" className={inputClass} defaultValue={initialStreetName} maxLength={160} name="streetName" placeholder="e.g. Gorordo Avenue" />
            </Field>
            <Field error={state.fieldErrors?.building} label="Building name (optional)">
              <input className={inputClass} defaultValue={submitted?.building ?? kyc?.building ?? ""} maxLength={160} name="building" />
            </Field>
            <Field error={state.fieldErrors?.postalCode} label="Postal code">
              <input autoComplete="postal-code" className={inputClass} defaultValue={submitted?.postalCode ?? kyc?.postalCode ?? ""} inputMode="numeric" maxLength={4} minLength={4} name="postalCode" pattern="[0-9]{4}" placeholder="e.g. 6000" required title="Enter a four-digit Philippine postal code" />
            </Field>
          </div>
          <Field error={state.fieldErrors?.addressDetails} help="Required for a building address or an unnamed road. Include enough detail to find the residence." label="Unit, subdivision, sitio, or landmark">
            <input autoComplete="address-line2" className={inputClass} defaultValue={submitted?.addressDetails ?? kyc?.addressDetails ?? ""} maxLength={200} name="addressDetails" placeholder="e.g. Unit 4, Sitio Riverside, near the barangay hall" />
          </Field>
        </fieldset>
        <ResidentialPinPicker
          addressChanged={addressChanged}
          error={state.fieldErrors?.residentialPin}
          initialPin={kyc?.residentialPin ?? null}
        />
      </div>
      <p className={checkout ? "checkout-id-note" : "text-sm text-stone-600"}>{checkout ? "Bring your original ID to pickup. " : "No SMS or ID upload. Bring the original ID to pickup. "}<Link className="font-semibold text-[#0b4f9c] underline" href="/privacy/government-id">Privacy details</Link></p>

      {state.status === "error" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {state.error === "underage" ? "Renters must be at least 18 years old." : state.error === "suspended" ? "This account cannot complete KYC." : state.error === "unauthorized" ? "Sign in again to save your details." : state.error === "pin_reconfirmation" ? "Your address or pin changed. Reconfirm the pin, or reload if you edited this profile elsewhere." : state.error === "save" ? "Your KYC details could not be saved. Please retry." : "Correct the highlighted KYC details."}
        </p>
      ) : null}
      <button className={checkout ? "checkout-primary" : "min-h-12 rounded-xl bg-stone-950 px-5 py-3 font-semibold text-white disabled:opacity-60"} disabled={pending} type="submit">
        {checkout ? pending ? "Saving your details…" : step === 1 ? "Continue to address" : "Save and continue to review" : pending ? "Saving KYC…" : kyc ? "Update KYC details" : "Save KYC details"}
        {checkout && !pending ? <ArrowRightIcon aria-hidden="true" /> : null}
      </button>
    </form>
  );
}

function Field({ children, error, help, label }: { children: ReactNode; error?: string; help?: string; label: string }) {
  return <label className="block text-sm font-medium">{label}{children}{help ? <span className="mt-2 block text-xs font-normal text-stone-500">{help}</span> : null}{error ? <span className="mt-2 block text-sm font-normal text-red-700" role="alert">{error}</span> : null}</label>;
}
