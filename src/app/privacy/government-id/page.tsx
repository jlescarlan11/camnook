import type { Metadata } from "next";
import Link from "next/link";

import { SiteHeader } from "@/features/bookings/components/site-header";
import { PRIVACY_EMAIL } from "@/features/privacy-email/constants";

export const metadata: Metadata = {
  title: "Draft government ID privacy notice | CamNook",
};

export default function GovernmentIdPrivacyNoticePage() {
  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <article className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-red-800">Draft notice — collection disabled</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Government ID evidence</h1>
          <p className="mt-3 text-sm text-stone-500">Version government-id-privacy-v2 · policy government-id-evidence-v2 · revised 15 August 2026</p>

          <div className="mt-8 space-y-7 leading-7 text-stone-700">
            <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950">
              <h2 className="font-semibold">Do not upload a real government ID</h2>
              <p className="mt-2">CamNook has not activated government ID collection. The current software is a synthetic-evidence development pipeline, not an identity-verification service. Collection must remain disabled until the controller and DPO details, legal basis, enforceable minimization, reviewer process, provider locations, backup treatment, retention schedule, and rights procedure below are completed and approved.</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-stone-950">Controller and privacy contact</h2>
              <p className="mt-2">Before collection begins, this notice must identify the legal person or entity operating CamNook, its business address, and the Data Protection Officer or privacy lead. The currently published contact is <a className="font-semibold underline decoration-amber-300 underline-offset-4" href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>, but activation also requires a completed end-to-end delivery test and a documented request-handling owner.</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-stone-950">Planned collection and minimization</h2>
              <p className="mt-2">The draft flow accepts one JPEG or PNG, up to 5 MiB, showing one side or page of a Philippine passport, PhilSys ID/ePhilID, driver’s license, or UMID. Before upload, the renter must cover the ID or document number (including PSN, PCN, or CRN), address, full birth date, signature, QR code, barcode, and machine-readable zone. Only the name, portrait, ID type, and expiry needed for the proposed comparison should remain visible. The flow does not request a selfie or perform OCR.</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-stone-950">Purpose, lawful basis, and consequences</h2>
              <p className="mt-2">The proposed purpose is an authorized comparison of the masked ID with the named renter for account-level identity checking and rental-fraud prevention. File-type, size, and hash checks establish file integrity only; they do not verify identity. The draft implementation records specific consent to this purpose and the exact notice version. Production activation requires a documented assessment that consent is freely given and can be withdrawn, plus a clear statement of what happens if the renter declines and whether a less intrusive alternative is available. If another lawful basis is selected for any processing, this notice must be revised before collection.</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-stone-950">Recipients, storage, and security</h2>
              <p className="mt-2">The draft pipeline stores the image in private Supabase Storage and processes uploads through the CamNook application hosted on Vercel. The current application denies staff and other renters access to raw bytes, so it cannot yet perform the proposed identity comparison. Any reviewer access must be purpose-limited, short-lived, protected by strong authentication, and read-audited. Before activation, CamNook must publish the relevant processor roles, storage and processing locations, cross-border safeguards, and any legally required disclosure categories. Images must never be placed in analytics, logs, email, or public URLs.</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-stone-950">Retention, withdrawal, and deletion</h2>
              <p className="mt-2">A finalized image is deleted as soon as it is no longer necessary and no later than 30 days after finalization. The renter may withdraw consent and request deletion of an unheld image at any time; the account flow removes it immediately and records completion only after the database verifies that the exact object is absent. Replaced evidence becomes due for protected cleanup. A legal hold may delay deletion only under a documented, authorized, and auditable procedure. Before activation, CamNook must separately define how long it retains consent evidence, decision metadata, hashes, and audit events, and must document whether provider backups contain the object and when any backup copy expires.</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-stone-950">Your privacy rights</h2>
              <p className="mt-2">A data subject may request access, correction, erasure or blocking, object to processing where applicable, withdraw consent, seek data portability where applicable, and raise a complaint. Requests may be sent to <a className="font-semibold underline decoration-amber-300 underline-offset-4" href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>; do not attach an ID file to email. Before activation, CamNook must publish identity-verification steps, response deadlines, escalation and appeal handling, and the DPO’s details. A data subject may also complain to the <a className="font-semibold underline decoration-amber-300 underline-offset-4" href="https://privacy.gov.ph">National Privacy Commission</a>.</p>
            </section>
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
              <h2 className="font-semibold">No production approval</h2>
              <p className="mt-2">This v2 draft is a release-control artifact, not evidence of NPC compliance or legal approval. The database gate is reset to disabled, and a later reviewed migration is required to activate collection.</p>
            </section>
          </div>

          <Link className="mt-8 inline-flex min-h-11 items-center font-semibold text-amber-900 underline decoration-amber-300 underline-offset-4" href="/account">
            Return to your account
          </Link>
        </article>
      </main>
    </div>
  );
}
