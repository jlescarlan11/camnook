import type { Metadata } from "next";
import Link from "next/link";

import { RequestForm } from "@/features/bookings/components/request-form";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { loadBookingRequestPageContext } from "@/features/bookings/data/booking-request-page";
import { formatHandoffTime } from "@/features/bookings/calendar";
import { formatManilaDateTime } from "@/features/bookings/manila-time";
import { KycProfileForm } from "@/features/kyc/kyc-profile-form";
import { requirePageUser } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Request a booking | CamNook" };

type NewBookingPageProps = {
  searchParams: Promise<{
    camera?: string | string[];
    handoffTime?: string | string[];
    pickup?: string | string[];
    pickupDate?: string | string[];
    policyVersion?: string | string[];
    return?: string | string[];
    returnDate?: string | string[];
  }>;
};

const phpFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
});

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function NewBookingPage({ searchParams }: NewBookingPageProps) {
  const params = await searchParams;
  const values = {
    camera: first(params.camera),
    handoffTime: first(params.handoffTime),
    pickup: first(params.pickup),
    pickupDate: first(params.pickupDate),
    policyVersion: first(params.policyVersion),
    return: first(params.return),
    returnDate: first(params.returnDate),
  };
  const query = new URLSearchParams(values).toString();
  const context = await requirePageUser(`/account/bookings/new?${query}`);
  const requestContext = await loadBookingRequestPageContext(context, values);
  const camera = requestContext.status === "success" ? requestContext.camera : undefined;
  const quote = requestContext.status === "success" ? requestContext.quote : undefined;
  const profile = requestContext.status === "success" ? requestContext.profile : undefined;
  const ready = camera && quote;

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
        <Link className="inline-flex min-h-11 items-center font-medium text-amber-900 underline decoration-amber-300 underline-offset-4" href={camera ? `/cameras/${camera.slug}` : "/"}>
          ← Back to camera
        </Link>
        <ol aria-label="Booking progress" className="mt-5 flex flex-wrap gap-2 text-sm text-stone-600">
          <li>✓ Browse</li><li aria-hidden="true">→</li><li>✓ Schedule</li><li aria-hidden="true">→</li><li className="font-semibold text-stone-950">Your details</li><li aria-hidden="true">→</li><li>Review &amp; request</li>
        </ol>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight">Request {camera?.name ?? "this camera"}</h1>
        <p className="mt-3 max-w-2xl leading-7 text-stone-600">
          Add only the details the owner needs to review your request.
        </p>

        {!ready ? (
          <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
            <h2 className="text-xl font-semibold">This request needs a fresh quote</h2>
            <p className="mt-2 leading-7">The camera or rental period is no longer quotable, or account data could not be loaded. Return to the catalog and try again.</p>
            <Link className="mt-4 inline-flex min-h-11 items-center font-semibold underline" href="/">Browse cameras</Link>
          </section>
        ) : (
          <>
            <section className="mt-8 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="schedule-summary-heading">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">Schedule selected</p><h2 className="mt-2 text-2xl font-semibold" id="schedule-summary-heading">{camera.name}</h2></div><Link className="font-semibold text-amber-900 underline" href={`/cameras/${camera.slug}`}>Change</Link></div>
              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                <ReviewValue label="Pickup" value={formatManilaDateTime(quote.pickupAt)} />
                <ReviewValue label="Return" value={formatManilaDateTime(quote.returnAt)} />
                <ReviewValue label="Rental subtotal" value={phpFormatter.format(quote.rentalAmount)} />
                <ReviewValue label="Deposit" value={phpFormatter.format(quote.securityDeposit)} />
                <ReviewValue label="Total" value={phpFormatter.format(quote.totalDue)} />
              </dl>
            </section>

            {profile?.accountStatus === "suspended" ? (
              <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
                <h2 className="text-xl font-semibold">Requests are unavailable</h2>
                <p className="mt-2 leading-7">This account is suspended and cannot submit requests. Contact CamNook for help.</p>
              </section>
            ) : !requestContext.kycProfile?.current ? (
              <section className="mt-8 rounded-3xl border border-amber-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="kyc-heading">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">Required before requesting</p>
                <h2 className="mt-2 text-2xl font-semibold" id="kyc-heading">Complete your renter KYC</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">Add the minimum details needed to confirm adult eligibility and prepare a rental contract. No SMS OTP or ID upload is required.</p>
                <KycProfileForm kyc={requestContext.kycProfile ?? null} profile={profile ?? null} returnTo={`/account/bookings/new?${query}`} />
              </section>
            ) : (
              <section className="mt-8 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
                <RequestForm
                  camera={values.camera}
                  key={query}
                  profile={profile ? { ...profile, defaultAddress: { areaName: requestContext.kycProfile.areaName, valid: true } } : profile}
                  returnHref={`/cameras/${camera.slug}`}
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
    <div className="rounded-xl bg-stone-50 p-4">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
