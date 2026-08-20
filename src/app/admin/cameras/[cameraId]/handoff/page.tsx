import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteHeader } from "@/features/bookings/components/site-header";
import { loadAdminCameraHandoffPolicy } from "@/features/listings/handoff-data";
import { HandoffPolicyForm } from "@/features/listings/handoff-policy-form";
import { requirePageAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Camera handoff policy | CamNook",
};

export default async function CameraHandoffPage({
  params,
}: {
  params: Promise<{ cameraId: string }>;
}) {
  const { cameraId } = await params;
  const context = await requirePageAdmin(`/admin/cameras/${cameraId}/handoff`);
  const result = await loadAdminCameraHandoffPolicy(context, cameraId);

  if (result.status === "missing") notFound();

  return (
    <div className="min-h-screen bg-stone-100 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
        <Link className="font-medium text-amber-800 underline" href="/admin">
          Back to owner operations
        </Link>
        {result.status === "error" ? (
          <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6" role="alert">
            <h1 className="text-2xl font-semibold">Handoff policy unavailable</h1>
            <p className="mt-2 text-red-900">
              Current settings could not be verified, so editing is closed. Reload before taking action.
            </p>
          </section>
        ) : (
          <section className="mt-8 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">
              Authorized sole admin
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              {result.policy.cameraName} handoff policy
            </h1>
            <p className="mt-3 text-stone-600">
              Camera status: {result.policy.cameraStatus}. Current policy version: {result.policy.version}.
            </p>
            <HandoffPolicyForm policy={result.policy} />
          </section>
        )}
      </main>
    </div>
  );
}
