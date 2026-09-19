import type { Metadata } from "next";
import Link from "next/link";

import { RequestForm } from "@/features/bookings/components/request-form";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { loadBookingRequestPageContext } from "@/features/bookings/data/booking-request-page";
import { formatHandoffTime } from "@/features/bookings/calendar";
import { formatManilaDateTime } from "@/features/bookings/manila-time";
import { scheduleEditHref } from "@/features/bookings/schedule-navigation";
import { KycProfileForm } from "@/features/kyc/kyc-profile-form";
import { requirePageUser } from "@/lib/auth/require-user";
import { checkoutQuery, checkoutValues, type CheckoutSearchParams } from "@/features/bookings/checkout-navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Rental checkout | CamNook" };

type CheckoutPageProps = { searchParams: Promise<CheckoutSearchParams> };

const phpFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
});

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const params = await searchParams;
  const values = checkoutValues(params);
  const query = checkoutQuery(params);
  const context = await requirePageUser(`/checkout?${query}`);
  const requestContext = await loadBookingRequestPageContext(context, values)
    .catch(() => ({ status: "error" as const }));
  const camera = requestContext.status === "success" ? requestContext.camera : undefined;
  const quote = requestContext.status === "success" ? requestContext.quote : undefined;
  const profile = requestContext.status === "success" ? requestContext.profile : undefined;
  const kycProfile = requestContext.status === "success" ? requestContext.kycProfile : undefined;
  const ready = camera && quote;
  const returnHref = camera ? scheduleEditHref(camera.slug, values) : "/";

  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <SiteHeader />
      <main className="page-shell py-8 sm:py-12">
        <Link className="inline-flex min-h-11 items-center font-medium text-[#0b4f9c] underline decoration-[#c9dcfb] underline-offset-4" href={returnHref}>
          {camera ? "Back to camera" : "Back to cameras"}
        </Link>
        <h1 className="page-title mt-5">Rental checkout</h1>

        {!ready ? (
          <section className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
            <h2 className="text-xl font-semibold">Your checkout needs an updated estimate</h2>
            <p className="mt-2 leading-7">We couldn’t load your rental details, or this schedule is no longer available. Return to the cameras and choose your schedule again.</p>
            <Link className="mt-4 inline-flex min-h-11 items-center font-semibold underline" href="/">Browse cameras</Link>
          </section>
        ) : (
          <>
            <section className="surface mt-8 p-6 sm:p-8" aria-labelledby="schedule-summary-heading">
              <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold" id="schedule-summary-heading">Rental summary</h2><Link className="inline-flex min-h-11 items-center font-semibold text-[#0b4f9c] underline decoration-[#c9dcfb] underline-offset-4" href={returnHref}>Change dates</Link></div>
              <p className="mt-3 text-lg font-semibold">{camera.name}</p>
              <dl className="mt-5 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-5">
                <ReviewValue label="Pickup" value={formatManilaDateTime(quote.pickupAt)} />
                <ReviewValue label="Return" value={formatManilaDateTime(quote.returnAt)} />
                <ReviewValue label="Rental subtotal" value={phpFormatter.format(quote.rentalAmount)} />
                <ReviewValue label="Security deposit" value={phpFormatter.format(quote.securityDeposit)} />
                <ReviewValue label="Estimated total" value={phpFormatter.format(quote.totalDue)} />
              </dl>
              <p className="mt-4 text-sm text-[#754000]">Estimate only—not reserved. Your rental request is subject to owner review and availability.</p>
            </section>

            {profile?.accountStatus === "suspended" ? (
              <section className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
                <h2 className="text-xl font-semibold">Requests are unavailable</h2>
                <p className="mt-2 leading-7">This account is suspended and cannot submit requests. Contact CamNook for help.</p>
              </section>
            ) : !kycProfile?.current ? (
              <section className="surface mt-8 p-6 sm:p-8" aria-labelledby="kyc-heading">
                <h2 className="text-2xl font-semibold" id="kyc-heading">Renter details</h2>
                <p className="mt-2 text-sm text-stone-600">Required for eligibility and your rental contract.</p>
                <KycProfileForm kyc={kycProfile ?? null} profile={profile ?? null} returnTo={`/checkout?${query}`} />
              </section>
            ) : (
              <section className="surface mt-8 max-w-3xl p-6 sm:p-8">
                <RequestForm
                  camera={values.camera}
                  key={query}
                  profile={profile ? { ...profile, defaultAddress: { areaName: kycProfile.areaName, valid: true } } : profile}
                  returnHref={returnHref}
                  schedule={{ handoffTime: values.handoffTime, pickupDate: values.pickupDate, policyVersion: values.policyVersion, returnDate: values.returnDate }}
                  summary={{
                    cameraName: camera.name,
                    dates: `${formatManilaDateTime(quote.pickupAt)} – ${formatManilaDateTime(quote.returnAt)}`,
                    handoffTime: `${formatHandoffTime(values.handoffTime)} PHT`,
                    rentalAmount: phpFormatter.format(quote.rentalAmount),
                    securityDeposit: phpFormatter.format(quote.securityDeposit),
                    totalDue: phpFormatter.format(quote.totalDue),
                  }}
                />
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ReviewValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-stone-200 py-3">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
