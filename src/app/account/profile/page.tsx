import type { Metadata } from "next";
import Link from "next/link";
import { AccountPageShell } from "@/features/account/components/account-page-shell";
import { ProfileSaveFeedback } from "@/features/account/components/profile-save-feedback";
import { loadProfilePage } from "@/features/account/data/profile";
import { KycProfileForm } from "@/features/kyc/kyc-profile-form";
import { requirePageUser } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profile | CamNook" };

export default async function ProfilePage() {
  const context = await requirePageUser("/account/profile");
  const account = await loadProfilePage(context).catch(() => ({ status: "error" as const, isAdmin: false }));
  return (
    <AccountPageShell title="Profile" activeSection="profile" isAdmin={account.isAdmin}>
      <div className="mx-auto mt-8 max-w-4xl space-y-8">
        {account.status === "error" ? (
          <section className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
            <h2 className="text-xl font-semibold">Profile unavailable</h2>
            <p className="mt-2 leading-7">We couldn’t load your renter details. Please retry before making changes.</p>
            <Link className="mt-3 inline-block font-semibold underline" href="/account/profile">Try again</Link>
          </section>
        ) : (
          <>
            <section className="surface p-6" aria-labelledby="account-summary-heading">
              <h2 className="text-xl font-semibold" id="account-summary-heading">Your account</h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <dt className="text-sm text-stone-500">Email</dt>
                  <dd className="mt-1 break-all">{context.user.email}</dd>
                </div>
                <div>
                  <dt className="text-sm text-stone-500">Account status</dt>
                  <dd className="mt-1 font-medium">{account.profile
                    ? account.profile.accountStatus === "active" ? "Active" : "Suspended"
                    : "Setup needed"}</dd>
                </div>
              </dl>
            </section>
            <section className="surface scroll-mt-6 p-5 sm:p-8" id="renter-details" aria-labelledby="renter-details-heading">
              <h2 className="text-xl font-semibold" id="renter-details-heading">Renter details</h2>
              <p className="mt-2 text-sm text-stone-600">Required before your first request. Keep these details up to date for your rentals.</p>
              <ProfileSaveFeedback>
                <KycProfileForm kyc={account.kycProfile} profile={account.profile} returnTo="/account/profile?saved=1#renter-details" />
              </ProfileSaveFeedback>
            </section>
          </>
        )}
      </div>
    </AccountPageShell>
  );
}
