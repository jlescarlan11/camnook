import type { Metadata } from "next";
import Link from "next/link";

import { SiteHeader } from "@/features/bookings/components/site-header";
import { PRIVACY_EMAIL } from "@/features/privacy-email/constants";

export const metadata: Metadata = {
  title: "Renter KYC and identity check notice | CamNook",
};

export default function GovernmentIdPrivacyNoticePage() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <article className="rounded-xl border border-stone-200 bg-white p-6 sm:p-10">
          <h1 className="text-4xl font-semibold tracking-tight">Identity &amp; privacy</h1>
          <p className="mt-3 text-sm text-stone-500">Effective 4 September 2026</p>

          <div className="mt-8 space-y-7 leading-7 text-stone-700">
            <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
              <h2 className="font-semibold">Your ID stays with you</h2>
              <p className="mt-2">Do not upload or email your government ID. Bring the original to pickup for a visual check.</p>
            </section>

            <details className="rounded-xl border border-stone-200 p-5">
              <summary className="cursor-pointer font-semibold text-[#0b4f9c]">Full privacy details</summary>
              <div className="mt-6 space-y-7">

            <section>
              <h2 className="text-xl font-semibold text-stone-950">What CamNook collects before booking</h2>
              <p className="mt-2">CamNook stores the renter’s full legal name, birthdate, mobile number, complete written residential address, and a required private residential map pin. These details establish adult eligibility, prepare the rental contract, support booking coordination, and reduce equipment-loss risk. The pin is not included in the rental contract and does not change meetup suggestions. SMS verification is not used.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-stone-950">Private residential map pin</h2>
              <p className="mt-2">Address search or reverse lookup sends the entered query or selected coordinates to Geoapify. “Use my current location” asks for browser permission, suggests matching Philippine address areas, and stages an unconfirmed map pin. Review the suggested areas and complete any missing details; your current location may not be your residence. CamNook stores only a confirmed pin with its selection method, optional device accuracy, and confirmation time.</p>
              <p className="mt-2">The application exposes the pin only to the signed-in renter; restricted database operators and backup systems may process it for service operation and recovery. Removing it hard-deletes the active pin record. Infrastructure backups may retain an earlier copy until the configured Supabase backup lifecycle expires. CamNook does not expose the pin in public profiles, booking responses, rental agreements, meetup routing, analytics, or ordinary logs.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-stone-950">What happens at pickup</h2>
              <p className="mt-2">The named renter must appear in person and show one original current government ID. An authorized administrator visually compares the name and photo with the renter and confirms that the ID shows the renter is at least 18 before releasing the camera.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-stone-950">What CamNook records</h2>
              <p className="mt-2">CamNook records the renter-entered KYC profile and freezes it into the applicable rental agreement. For the physical ID, CamNook records only the pickup time, administrator, and yes/no attestations that the renter was present and the original ID was checked and matched. CamNook does not photograph the ID or copy its number, type, signature, QR code, barcode, or expiry.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-stone-950">Purpose and legal basis</h2>
              <p className="mt-2">The KYC profile and limited visual check are used to take steps toward and perform the rental contract, confirm adult eligibility, prevent release to the wrong person, and protect the renter and equipment. This approach follows the Data Privacy Act principles of transparency, legitimate purpose, and proportionality by collecting contract-relevant details while using a less intrusive physical check instead of retaining an ID copy.</p>
              <p className="mt-3 text-sm">Reference: <a className="font-semibold underline decoration-amber-300 underline-offset-4" href="https://privacy.gov.ph/data-privacy-act/" rel="noreferrer" target="_blank">Republic Act No. 10173, Data Privacy Act of 2012</a>.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-stone-950">If you decline</h2>
              <p className="mt-2">A renter who does not provide the required profile details cannot submit a booking request. CamNook cannot release equipment when the original ID does not match the named adult renter and signed contract.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-stone-950">Privacy requests</h2>
              <p className="mt-2">For access, correction, deletion, objection, or another privacy concern, email <a className="font-semibold underline decoration-amber-300 underline-offset-4" href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>. Do not attach an ID file. You may also contact the <a className="font-semibold underline decoration-amber-300 underline-offset-4" href="https://privacy.gov.ph" rel="noreferrer" target="_blank">National Privacy Commission</a>.</p>
            </section>

              </div>
            </details>
          </div>

          <Link className="mt-8 inline-flex min-h-11 items-center font-semibold text-amber-900 underline decoration-amber-300 underline-offset-4" href="/account">
            Return to your account
          </Link>
        </article>
      </main>
    </div>
  );
}
