import type { Metadata } from "next";
import Link from "next/link";

import { logout } from "@/features/auth/actions";
import { SiteHeader } from "@/features/bookings/components/site-header";
import {
  loadOwnerOperationsDashboard,
  loadOwnerPortfolioReport,
} from "@/features/portfolio/data";
import {
  OwnerOperationsPanel,
  OwnerPortfolioPanel,
} from "@/features/portfolio/owner-dashboard";
import { resolvePortfolioPeriod } from "@/features/portfolio/period";
import { requirePageAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Owner operations and portfolio | CamNook",
};

type AdminPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const context = await requirePageAdmin("/admin");
  const periodSelection = resolvePortfolioPeriod(await searchParams);

  const [operations, portfolio] = await Promise.all([
    loadOwnerOperationsDashboard(context),
    periodSelection.status === "valid"
      ? loadOwnerPortfolioReport(context, periodSelection.period)
      : Promise.resolve({ status: "invalid" } as const),
  ]);

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
          aria-labelledby="closed-gates-heading"
        >
          <h2 className="font-semibold" id="closed-gates-heading">
            Launch gates remain closed
          </h2>
          <p className="mt-1">
            This owner surface does not authorize Production identity collection,
            payment enablement, handoff, refunds, public launch, or any other
            unresolved operational approval. It reports only committed records.
          </p>
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
