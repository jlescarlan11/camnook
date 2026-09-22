import { loadCameraMeetupPlaces } from "@/features/meetups/place-data";
import type { Metadata } from "next";
import Link from "next/link";

import { CheckoutLayout } from "@/features/bookings/components/checkout-layout";
import { loadPublicCamera } from "@/features/bookings/data/catalog";
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

  const checkoutHref = `/checkout?${query}`;
  const edit = Array.isArray(params.edit) ? params.edit[0] : params.edit;

  if (!ready) return (
    <div className="min-h-screen bg-white text-stone-950">
      <SiteHeader />
      <main className="page-shell py-8 sm:py-12">
        <h1 className="page-title">Rental checkout</h1>
        <section className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
          <h2 className="text-xl font-semibold">Your checkout needs an updated estimate</h2>
          <p className="mt-2 leading-7">We couldn’t load your rental details, or this schedule is no longer available. Return to the cameras and choose your schedule again.</p>
          <Link className="mt-4 inline-flex min-h-11 items-center font-semibold underline" href="/">Browse cameras</Link>
        </section>
      </main>
    </div>
  );

  // Photography is optional presentation data; quote/auth failures still fail closed above.
  const listing = await loadPublicCamera(camera.slug).catch(() => null);
  const photo = listing?.status === "success" && listing.camera.id === camera.id
    ? listing.camera.photos[0] : undefined;
  const meetupPlaces = await loadCameraMeetupPlaces(context, camera.id).catch(() => null);
  const shortDate = (value: string) => new Intl.DateTimeFormat("en-PH", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila",
  }).format(new Date(value));

  return <CheckoutLayout returnHref={returnHref} summary={{
    cameraName: camera.name, photo,
    pickup: shortDate(quote.pickupAt), returnDate: shortDate(quote.returnAt),
    rentalAmount: phpFormatter.format(quote.rentalAmount),
    securityDeposit: phpFormatter.format(quote.securityDeposit), totalDue: phpFormatter.format(quote.totalDue),
  }}>
    {profile?.accountStatus === "suspended" ? (
      <section className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
        <h2 className="text-xl font-semibold">Requests are unavailable</h2>
        <p className="mt-2 leading-7">This account is suspended and cannot submit requests. Contact CamNook for help.</p>
      </section>
    ) : !kycProfile?.current || edit === "details" || edit === "address" ? (
      <KycProfileForm key={`${query}-${edit ?? "details"}`} checkout initialStep={edit === "address" ? 2 : 1}
        draftKey={`camnook:checkout:v1:${context.user.id}:${kycProfile?.addressRevision ?? "new"}`}
        kyc={kycProfile ?? null} profile={profile ?? null} returnTo={checkoutHref} />
    ) : (
      <RequestForm
        meetupPlaces={meetupPlaces}
        checkoutHref={checkoutHref}
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
          securityDeposit: phpFormatter.format(quote.securityDeposit), totalDue: phpFormatter.format(quote.totalDue),
        }}
      />
    )}
  </CheckoutLayout>;
}
