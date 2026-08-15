import type { Metadata } from "next";
import Link from "next/link";

import { SiteHeader } from "@/features/bookings/components/site-header";
import { PRIVACY_EMAIL } from "@/features/privacy-email/constants";

export const metadata: Metadata = {
  title: "Government ID privacy notice | CamNook",
};

export default function GovernmentIdPrivacyNoticePage() {
  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <article className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-800">Privacy notice</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Government ID evidence</h1>
          <p className="mt-3 text-sm text-stone-500">Version government-id-privacy-v1 · policy government-id-evidence-v1</p>

          <div className="mt-8 space-y-7 leading-7 text-stone-700">
            <section>
              <h2 className="text-xl font-semibold text-stone-950">What we collect and why</h2>
              <p className="mt-2">CamNook collects one JPEG, PNG, or PDF—up to 5 MiB—of a Philippine passport, PhilSys ID/ePhilID, driver’s license, or UMID. It is used only to confirm the named renter’s identity and reduce fraud before a rental decision. This flow does not request a separate full ID number, selfie, proof of address, or OCR result.</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-stone-950">Private access</h2>
              <p className="mt-2">The file stays in private Supabase Storage. Only the owning renter can retrieve it in Sprint 1; anonymous users, other renters, and staff are denied raw-byte access. Any future reviewer access must be separately approved, purpose-limited, short-lived, and audited. The file is never placed in analytics, email, logs, or a public URL.</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-stone-950">Retention, replacement, and deletion</h2>
              <p className="mt-2">Each finalized object is retained for 30 days. Replacement creates a new private object and never overwrites earlier evidence. You may request deletion from your account at any time; an early request is scheduled. Once eligible, the account flow or protected daily process removes the object, and CamNook records completion only after the database verifies that the exact object is absent. A documented legal hold placed before cleanup is claimed delays deletion. Failed cleanup remains retryable. The minimum decision and path-free audit history remain after the bytes are removed.</p>
            </section>
            <section>
              <h2 className="text-xl font-semibold text-stone-950">Security and your choices</h2>
              <p className="mt-2">Opaque UUID paths, 15-minute upload intents, exact-path authorization, file signature/size/hash checks, and a no-overwrite rule protect the evidence. You may view submission state, replace pending evidence, request deletion, and raise access, correction, objection, or other privacy concerns by emailing <a className="font-semibold underline decoration-amber-300 underline-offset-4" href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. Do not attach or send government ID files by email; use only the protected account upload.</p>
            </section>
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
              <h2 className="font-semibold">Production activation notice</h2>
              <p className="mt-2">CamNook must test delivery to the monitored privacy contact and complete Philippine legal review before Production ID collection is enabled. Live-object deletion does not mean every infrastructure backup disappears instantly; backups age out under their separate protected cycle.</p>
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
