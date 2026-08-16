import type { Metadata } from "next";
import Link from "next/link";

import { SiteHeader } from "@/features/bookings/components/site-header";
import { PRIVACY_EMAIL } from "@/features/privacy-email/constants";

export const metadata: Metadata = {
  title: "In-person identity check notice | CamNook",
};

export default function GovernmentIdPrivacyNoticePage() {
  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <article className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-800">Effective operating notice</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">In-person identity check</h1>
          <p className="mt-3 text-sm text-stone-500">Version in-person-id-v1 · effective 16 August 2026</p>

          <div className="mt-8 space-y-7 leading-7 text-stone-700">
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
              <h2 className="font-semibold">No government-ID upload</h2>
              <p className="mt-2">CamNook does not ask renters to upload or email a government ID. A booking request and approval do not depend on online KYC.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-stone-950">What happens at pickup</h2>
              <p className="mt-2">The named renter must appear in person and show one original current government ID. An authorized administrator visually compares the name and photo with the renter and the signed rental contract before releasing the camera.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-stone-950">What CamNook records</h2>
              <p className="mt-2">CamNook records the pickup time, the administrator, and yes/no attestations that the named renter was present and the original ID was checked and matched. CamNook does not photograph the ID or record its number, type, address, birth date, signature, QR code, barcode, or expiry.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-stone-950">Purpose and legal basis</h2>
              <p className="mt-2">The limited visual check is used to perform the rental contract, prevent release to the wrong person, and protect the renter and equipment. This approach follows the Data Privacy Act principles of transparency, legitimate purpose, and proportionality by using a less intrusive physical check instead of retaining an ID copy.</p>
              <p className="mt-3 text-sm">Reference: <a className="font-semibold underline decoration-amber-300 underline-offset-4" href="https://privacy.gov.ph/data-privacy-act/" rel="noreferrer" target="_blank">Republic Act No. 10173, Data Privacy Act of 2012</a>.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-stone-950">If you decline</h2>
              <p className="mt-2">CamNook cannot release rented equipment to a person whose identity cannot be matched to the named renter and signed contract. Contact CamNook before pickup if the renter’s legal name needs correction.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-stone-950">Privacy requests</h2>
              <p className="mt-2">For access, correction, deletion, objection, or another privacy concern, email <a className="font-semibold underline decoration-amber-300 underline-offset-4" href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. Do not attach an ID file. You may also contact the <a className="font-semibold underline decoration-amber-300 underline-offset-4" href="https://privacy.gov.ph" rel="noreferrer" target="_blank">National Privacy Commission</a>.</p>
            </section>

            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
              <h2 className="font-semibold">Owner approval</h2>
              <p className="mt-2">The CamNook owner approved this minimized operating policy on 16 August 2026. It is an operational privacy decision based on Philippine law, not a representation that outside legal counsel reviewed the business.</p>
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
