import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { logout } from "@/features/auth/actions";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { loadAdminDashboardContext } from "@/features/portfolio/data";
import {
  OwnerOperationsPanel,
  OwnerPortfolioPanel,
} from "@/features/portfolio/owner-dashboard";
import { resolvePortfolioPeriod } from "@/features/portfolio/period";
import { requirePageUser } from "@/lib/auth/require-user";
import { GcashConfigurationForm } from "@/features/payments/gcash-configuration-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Owner operations and portfolio | CamNook",
};

type AdminPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const context = await requirePageUser("/admin");
  const periodSelection = resolvePortfolioPeriod(await searchParams);

  const dashboard = await loadAdminDashboardContext(
    context,
    periodSelection.status === "valid" ? periodSelection.period : null,
  );
  if ("forbidden" in dashboard) redirect("/forbidden");

  const {
    gcashConfiguration,
    handoffPolicies,
    operations,
    portfolio,
  } = dashboard;

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">
              Authorized sole admin
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              Operations and portfolio
            </h1>
            <p className="mt-3 text-stone-600">
              Signed in as {context.user.email}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              className="inline-flex min-h-11 items-center rounded-xl border border-stone-300 bg-white px-4 py-2 font-medium"
              href="/account"
            >
              Account
            </Link>
            <form action={logout}>
              <button
                className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 py-2 font-medium"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

        <section
          className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"
          aria-labelledby="operating-controls-heading"
        >
          <h2 className="font-semibold" id="operating-controls-heading">
            Production operating controls
          </h2>
          <p className="mt-1">
            Online Government-ID uploads were removed. Booking approval does not require
            online KYC; the named renter and original ID are checked physically at
            pickup without retaining an ID image or number. This surface reports
            committed records and keeps money and handoff mutations audited.
          </p>
        </section>

        {gcashConfiguration.status === "success" ? (
          <GcashConfigurationForm
            configuration={gcashConfiguration.configuration}
          />
        ) : (
          <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
            <h2 className="text-xl font-semibold">GCash configuration unavailable</h2>
            <p className="mt-2 text-sm leading-6">
              The authoritative recipient could not be read, so no payment configuration form is shown. Reload before changing payment instructions.
            </p>
          </section>
        )}

        <section
          aria-labelledby="handoff-policies-heading"
          className="mt-8 rounded-2xl border border-stone-200 bg-white p-6"
        >
          <h2 className="text-xl font-semibold" id="handoff-policies-heading">
            Camera handoff policies
          </h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Configure each camera’s public city label and fixed Asia/Manila handoff slots. Private city anchors remain visible only to the administrator.
          </p>
          {handoffPolicies.status === "error" ? (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
              Camera policy state could not be verified. Editing links are closed until a reload succeeds.
            </p>
          ) : handoffPolicies.cameras.length === 0 ? (
            <p className="mt-4 text-sm text-stone-600">No configurable cameras are available.</p>
          ) : (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {handoffPolicies.cameras.map((camera) => (
                <li className="rounded-xl border border-stone-200 p-4" key={camera.cameraId}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{camera.cameraName}</p>
                      <p className="mt-1 text-sm text-stone-600">
                        {camera.cityLabel ?? "Not configured"} · {camera.enabled ? "Enabled" : "Disabled"} · v{camera.version}
                      </p>
                    </div>
                    <span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-medium uppercase">
                      {camera.cameraStatus}
                    </span>
                  </div>
                  <Link
                    className="mt-4 inline-flex min-h-11 items-center font-semibold text-amber-800 underline"
                    href={`/admin/cameras/${camera.cameraId}/handoff`}
                  >
                    Configure handoffs
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {operations.status === "success" ? (
          <OwnerOperationsPanel dashboard={operations.dashboard} />
        ) : (
          <section
            className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900"
            role="alert"
          >
            <h2 className="text-xl font-semibold">
              Operations dashboard unavailable
            </h2>
            <p className="mt-2 leading-7">
              Current state could not be rechecked. Every operational section is
              intentionally closed; do not interpret missing queues or totals as
              zero and do not take an off-system action.
            </p>
            <Link className="mt-3 inline-block font-semibold underline" href="/admin">
              Try again
            </Link>
          </section>
        )}

        <OwnerPortfolioPanel
          invalidPeriod={periodSelection.status === "invalid"}
          period={periodSelection.period}
          report={portfolio.status === "success" ? portfolio.report : null}
        />
      </main>
    </div>
  );
}
