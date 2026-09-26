"use client";

import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { ArrowRightIcon } from "@radix-ui/react-icons";
import { CheckoutProgress } from "@/features/bookings/components/checkout-progress";
import { cloneElement, startTransition, useActionState, useEffect, useRef, useState, type FormEvent, type ReactElement, useSyncExternalStore } from "react";

import { PsgcAreaSelector } from "@/features/locations/psgc-area-selector";
import type { AddressLocationResult } from "@/features/locations/types";

import { saveKycProfile, type KycActionState } from "./actions";
import { ResidentialPinPicker, type DraftPin } from "./residential-pin-picker";
import { AddressLocationControl } from "./address-location-control";
import type { KycProfile } from "./types";

import { readCheckoutDraft, writeCheckoutDraft } from "./checkout-draft";
import { PhilippineMobileInput } from "@/components/philippine-mobile-input";
import { kycDateYearsAgo } from "./age";

const subscribe = () => () => {};

const initialState: KycActionState = { status: "idle" };
const inputClass = "mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-[#0b4f9c] focus:ring-4 focus:ring-[#c9dcfb]";

type FormProps = {
  checkout?: boolean;
  draftKey?: string;
  initialStep?: 1 | 2;
  kyc: KycProfile | null;
  profile: null | { legalName: string; phone: string };
  returnTo: string;
};

export function KycProfileForm(props: FormProps) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  if (props.draftKey && !hydrated) return <p role="status">Loading your details…</p>;
  return <ProfileForm key={props.draftKey} {...props} />;
}

function ProfileForm({
  kyc,
  profile,
  returnTo,
  checkout = false,
  initialStep = 1,
  draftKey,
}: FormProps) {
  const [draft] = useState(() => readCheckoutDraft<Record<string, string>>(draftKey));
  const formRef = useRef<HTMLFormElement>(null);
  const [addressEditRevision, setAddressEditRevision] = useState(Number(draft?.addressEditRevision) || 0);
  const revision = useRef(addressEditRevision);
  const [locationInvalidation, setLocationInvalidation] = useState(0);
  const [mapInvalidation, setMapInvalidation] = useState(0);
  const locationSequence = useRef(0);
  const pendingPin = useRef<{requestId:number;pin:DraftPin} | null>(null);
  const [externalSelection,setExternalSelection] = useState<{requestId:number;release:string;path:AddressLocationResult["path"]}>();
  const [suggestedPin,setSuggestedPin] = useState<{requestId:number;pin:DraftPin}>();
  const [pinError,setPinError] = useState(false);
  const [step, setStep] = useState<1 | 2>(initialStep);
  const [state, action, pending] = useActionState(async (previous: KycActionState, data: FormData) => {
    let result: KycActionState;
    try {
      result = await saveKycProfile(previous, data);
    } catch (error) {
      unstable_rethrow(error);
      result = { error: "indeterminate", status: "error" };
    }
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
  const submitted = state.values ?? draft;
  const legacyAddress = kyc?.addressFormatVersion === 1 ? kyc.addressLine1 : "";
  const initialStreetName = submitted?.streetName ?? kyc?.streetName ?? "";

  function persistDetails() {
    if (!formRef.current) return;
    const values = new FormData(formRef.current);
    writeCheckoutDraft(draftKey, Object.fromEntries([
      "legalName", "birthDate", "phone", "houseNumber", "streetName", "building",
      "postalCode", "addressDetails", "legacyAddressLine1",
    ].map((name) => [name, values.get(name) ?? ""]).concat([["addressEditRevision",String(revision.current)]])));
  }
  function invalidateLocation() {
    setLocationInvalidation(n=>n+1);
    setExternalSelection(undefined);
    pendingPin.current=null;
  }
  function markAddressChanged() {
    setAddressChanged(true);
    revision.current++;
    setAddressEditRevision(revision.current);
    persistDetails();
  }
  function trackAddressChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if ([
      "addressDetails", "building", "houseNumber", "legacyAddressLine1",
      "postalCode", "psgcAreaCode", "streetName",
    ].includes(target.name)) {
      invalidateLocation();
      markAddressChanged();
    } else persistDetails();
  }

  return (
    <form ref={formRef} className={checkout ? "checkout-kyc" : "mt-6 space-y-5"} onChange={trackAddressChange}
      noValidate={checkout} onSubmit={(event) => {
        event.preventDefault();
        invalidateLocation();
        if (pending) return;
        setMapInvalidation(n=>n+1);
        if ((!checkout || step === 2) && new FormData(event.currentTarget).get("pinConfirmationRequired") === "1") {
          event.preventDefault();setPinError(true);return;
        }
        if (checkout && step === 1) {
          if (validateDetails()) setStep(2);
          return;
        }
        if (checkout && (!validateDetails() || !event.currentTarget.reportValidity())) return;
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}>
      {checkout ? <>
        <CheckoutProgress step={step} onDetails={() => setStep(1)} />
        <h2 className="checkout-section-title" ref={stepHeading} tabIndex={-1}>{step === 1 ? "Your details" : "Your address"}</h2>
        <p className="checkout-section-intro">{step === 1 ? "Required for eligibility and your rental contract." : "Add your Philippine residence for your rental contract."}</p>
      </> : null}
      <input name="returnTo" type="hidden" value={returnTo} />
      <input name="expectedAddressRevision" type="hidden" value={kyc?.addressRevision ?? ""} />
      <div ref={personalFields} hidden={checkout && step !== 1} className={checkout ? "checkout-personal-fields" : "grid grid-cols-1 gap-5 sm:grid-cols-2"}>
        <Field error={state.fieldErrors?.legalName} id="kyc-legal-name" label="Full legal name">
          <input autoComplete="name" className={inputClass} defaultValue={submitted?.legalName ?? profile?.legalName ?? ""} maxLength={160} name="legalName" minLength={2} placeholder={checkout ? "Enter your full legal name" : undefined} required />
        </Field>
        <Field error={state.fieldErrors?.birthDate} id="kyc-birthdate" label="Birthdate">
          <input className={inputClass} defaultValue={submitted?.birthDate ?? kyc?.birthDate ?? ""} max={kycDateYearsAgo(18)} name="birthDate" required type="date" />
        </Field>
        <Field error={state.fieldErrors?.phone} id="kyc-phone" label="Mobile number">
          <PhilippineMobileInput aria-label="Mobile number" defaultValue={submitted?.phone ?? profile?.phone ?? ""} name="phone" required />
        </Field>
      </div>
      <div hidden={checkout && step !== 2} className={checkout ? "checkout-address-fields" : "space-y-5"}>
        <div>
          <AddressLocationControl invalidationKey={locationInvalidation} disabled={pending}
            onStart={()=>{setExternalSelection(undefined);pendingPin.current=null;setMapInvalidation(n=>n+1);}}
            onResult={(result,pin)=>{
            const requestId=++locationSequence.current;
            if (!result.path.length) {setSuggestedPin({requestId,pin});return;}
            pendingPin.current={requestId,pin};
            setExternalSelection({requestId,release:result.release,path:result.path});
          }}/>
          <PsgcAreaSelector presentation="shopping" externalSelection={externalSelection}
            onExternalSelectionApplied={requestId=>{
              if (pendingPin.current?.requestId === requestId) {
                setSuggestedPin(pendingPin.current);pendingPin.current=null;
              }
            }} onManualSelectionChange={invalidateLocation}
            errorId={state.fieldErrors?.psgcAreaCode ? "kyc-area-error" : undefined} initialPath={kyc?.path} draftKey={draftKey ? `${draftKey}:area` : undefined} invalid={Boolean(state.fieldErrors?.psgcAreaCode)} onSelectionChange={markAddressChanged} />
          {state.fieldErrors?.psgcAreaCode ? <p className="mt-2 text-sm text-red-700" id="kyc-area-error" role="alert">{state.fieldErrors.psgcAreaCode}</p> : null}
        </div>
        <fieldset className="space-y-4 rounded-xl border border-stone-200 p-4">
          <legend className="px-1 font-semibold">Residential address details</legend>
          {legacyAddress ? (
            <Field error={state.fieldErrors?.legacyAddressLine1} help="For reference only. Complete the structured address fields below before saving." id="kyc-legacy-address" label="Existing address details">
              <input autoComplete="address-line1" className={inputClass} defaultValue={submitted?.legacyAddressLine1 ?? legacyAddress} maxLength={500} name="legacyAddressLine1" readOnly />
            </Field>
          ) : <input name="legacyAddressLine1" type="hidden" value="" />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field error={state.fieldErrors?.houseNumber} help="Required unless you provide both a building name and unit details." id="kyc-house-number" label="House or lot number">
              <input className={inputClass} defaultValue={submitted?.houseNumber ?? kyc?.houseNumber ?? ""} maxLength={80} name="houseNumber" placeholder="e.g. 12 or Lot 4 Block 2" />
            </Field>
            <Field error={state.fieldErrors?.streetName} help="Leave blank only when the road has no official name." id="kyc-street-name" label="Street name">
              <input autoComplete="address-line1" className={inputClass} defaultValue={initialStreetName} maxLength={160} name="streetName" placeholder="e.g. Gorordo Avenue" />
            </Field>
            <Field error={state.fieldErrors?.building} id="kyc-building" label="Building name (optional)">
              <input className={inputClass} defaultValue={submitted?.building ?? kyc?.building ?? ""} maxLength={160} name="building" />
            </Field>
            <Field error={state.fieldErrors?.postalCode} id="kyc-postal-code" label="Postal code">
              <input autoComplete="postal-code" className={inputClass} defaultValue={submitted?.postalCode ?? kyc?.postalCode ?? ""} inputMode="numeric" maxLength={4} minLength={4} name="postalCode" pattern="[0-9]{4}" placeholder="e.g. 6000" required title="Enter a four-digit Philippine postal code" />
            </Field>
          </div>
          <Field error={state.fieldErrors?.addressDetails} help="Required for a building address or an unnamed road. Include enough detail to find the residence." id="kyc-address-details" label="Unit, subdivision, sitio, or landmark">
            <input autoComplete="address-line2" className={inputClass} defaultValue={submitted?.addressDetails ?? kyc?.addressDetails ?? ""} maxLength={200} name="addressDetails" placeholder="e.g. Unit 4, Sitio Riverside, near the barangay hall" />
          </Field>
        </fieldset>
        <ResidentialPinPicker
          draftKey={draftKey ? `${draftKey}:pin` : undefined}
          addressChanged={addressChanged || Boolean(draft)}
          addressEditRevision={addressEditRevision}
          suggestedPin={suggestedPin}
          mapInvalidationKey={mapInvalidation}
          onManualPinChange={()=>{invalidateLocation();setPinError(false);}}
          error={pinError ? "Confirm your residential map pin before saving." : state.fieldErrors?.residentialPin}
          initialPin={kyc?.residentialPin ?? null}
        />
      </div>
      <p className={checkout ? "checkout-id-note" : "text-sm text-stone-600"}>{checkout ? "Bring your original ID to pickup. " : "No SMS or ID upload. Bring the original ID to pickup. "}<Link className="font-semibold text-[#0b4f9c] underline" href="/privacy/government-id" target="_blank" rel="noopener noreferrer">Privacy details (opens in a new tab)</Link></p>

      {state.status === "error" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {state.error === "underage" ? "Renters must be at least 18 years old." : state.error === "suspended" ? "This account cannot complete KYC." : state.error === "unauthorized" ? "Sign in again to save your details." : state.error === "pin_reconfirmation" ? "Your address or pin changed. Reconfirm the pin, or reload if you edited this profile elsewhere." : state.error === "indeterminate" ? "The saved outcome could not be confirmed. Reload to check your details before retrying." : state.error === "save" ? "Your KYC details could not be saved. Please retry." : "Correct the highlighted KYC details."}
        </p>
      ) : null}
      <button className={checkout ? "checkout-primary" : "min-h-12 rounded-xl bg-stone-950 px-5 py-3 font-semibold text-white disabled:opacity-60"} disabled={pending} type="submit">
        {checkout ? pending ? "Saving your details…" : step === 1 ? "Continue to address" : "Save and continue to review" : pending ? "Saving details…" : kyc ? "Update renter details" : "Save renter details"}
        {checkout && !pending ? <ArrowRightIcon aria-hidden="true" /> : null}
      </button>
    </form>
  );
}

function Field({ children, error, help, id, label }: { children: ReactElement<{ "aria-describedby"?: string; "aria-invalid"?: boolean }>; error?: string; help?: string; id: string; label: string }) {
  return <label className="block text-sm font-medium">{label}{cloneElement(children, {
    "aria-describedby": error ? [children.props["aria-describedby"], `${id}-error`].filter(Boolean).join(" ") : children.props["aria-describedby"],
    "aria-invalid": error ? true : children.props["aria-invalid"],
  })}{help ? <span className="mt-2 block text-xs font-normal text-stone-500">{help}</span> : null}{error ? <span className="mt-2 block text-sm font-normal text-red-700" id={`${id}-error`} role="alert">{error}</span> : null}</label>;
}
