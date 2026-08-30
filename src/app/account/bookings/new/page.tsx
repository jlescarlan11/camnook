import type { Metadata } from "next";
import Link from "next/link";

import { quoteBooking } from "@/features/bookings/actions/quote-booking";
import { ProfileForm } from "@/features/bookings/components/profile-form";
import { RequestForm } from "@/features/bookings/components/request-form";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { loadAccountProfile } from "@/features/bookings/data/account";
import { loadCatalog } from "@/features/bookings/data/catalog";
import { formatManilaDateTime } from "@/features/bookings/manila-time";
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
  const quoteData = new FormData();
  Object.entries(values).forEach(([name, value]) => quoteData.set(name, value));
  const [quoteState, account, catalog] = await Promise.all([
    quoteBooking({ status: "idle" }, quoteData),
    loadAccountProfile(context),
    loadCatalog(),
  ]);
  const camera =
    catalog.status === "success"
      ? catalog.cameras.find((item) => item.id === values.camera)
      : undefined;
  const quote = quoteState.status === "success" ? quoteState.quote : undefined;
  const ready = account.status === "success" && camera && quote;

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
        <Link className="inline-flex min-h-11 items-center font-medium text-amber-900 underline decoration-amber-300 underline-offset-4" href={camera ? `/cameras/${camera.slug}` : "/"}>
          ← Back to camera
        </Link>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight">Request this rental</h1>
        <p className="mt-3 max-w-2xl leading-7 text-stone-600">
          Review the freshly quoted period, complete your renter profile if
          needed, then submit one real request for review.
        </p>

        {!ready ? (
          <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
            <h2 className="text-xl font-semibold">This request needs a fresh quote</h2>
            <p className="mt-2 leading-7">The camera or rental period is no longer quotable, or account data could not be loaded. Return to the catalog and try again.</p>
            <Link className="mt-4 inline-flex min-h-11 items-center font-semibold underline" href="/">Browse cameras</Link>
          </section>
        ) : (
          <>
            <section className="mt-8 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="fresh-quote-heading">
              <h2 className="text-2xl font-semibold" id="fresh-quote-heading">Fresh authoritative estimate</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">{camera.name}. This estimate does not reserve inventory; approval remains subject to availability. The named renter shows an original ID in person at pickup.</p>
              <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                <ReviewValue label="Pickup (Asia/Manila)" value={formatManilaDateTime(quote.pickupAt)} />
                <ReviewValue label="Return (Asia/Manila)" value={formatManilaDateTime(quote.returnAt)} />
                <ReviewValue label="Billable days" value={String(quote.billableDays)} />
                <ReviewValue label="Daily rate" value={phpFormatter.format(quote.dailyRate)} />
                <ReviewValue label="Rental amount" value={phpFormatter.format(quote.rentalAmount)} />
                <ReviewValue label="Security deposit" value={phpFormatter.format(quote.securityDeposit)} />
                <ReviewValue label="Total due" value={phpFormatter.format(quote.totalDue)} />
                <ReviewValue label="Currency" value={quote.currency} />
              </dl>
            </section>

            {!account.profile ? (
              <section className="mt-8 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="profile-prerequisite-heading">
                <h2 className="text-2xl font-semibold" id="profile-prerequisite-heading">Complete your profile first</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">Your legal name and phone are required before a booking request can be submitted.</p>
                <ProfileForm />
              </section>
            ) : account.profile.accountStatus === "suspended" ? (
              <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
                <h2 className="text-xl font-semibold">Requests are unavailable</h2>
                <p className="mt-2 leading-7">This account is suspended and cannot submit requests. Contact CamNook for help.</p>
              </section>
            ) : (
              <section className="mt-8 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="request-heading">
                <h2 className="text-2xl font-semibold" id="request-heading">Booking request</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">Submitting creates a <strong>FOR_REVIEW</strong> request. It does not place an availability hold.</p>
                <RequestForm
                  camera={values.camera}
                  pickup={values.pickup}
                  returnHref={`/cameras/${camera.slug}`}
                  returnValue={values.return}
                  schedule={
                    values.pickupDate ||
                    values.returnDate ||
                    values.handoffTime ||
                    values.policyVersion
                      ? {
                          handoffTime: values.handoffTime,
                          pickupDate: values.pickupDate,
                          policyVersion: values.policyVersion,
                          returnDate: values.returnDate,
                        }
                      : undefined
                  }
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
