import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { SiteHeader } from "@/features/bookings/components/site-header";
import { loadAdminCameraHandoffPolicy } from "@/features/listings/handoff-data";
import { HandoffPolicyForm } from "@/features/listings/handoff-policy-form";
import { getAdminStatus } from "@/lib/auth/require-admin";
import { requirePageUser } from "@/lib/auth/require-user";

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
  const context = await requirePageUser(`/admin/cameras/${cameraId}/handoff`);
  if (!z.uuid().safeParse(cameraId).success) {
    if (!(await getAdminStatus(context))) redirect("/forbidden");
    notFound();
  }
  const result = await loadAdminCameraHandoffPolicy(context, cameraId);

  if (result.status === "forbidden") redirect("/forbidden");
  if (result.status === "missing") notFound();

  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
        <Link className="font-medium text-[#0b4f9c] underline" href="/admin/cameras">
          ← Cameras
        </Link>
        {result.status === "error" ? (
          <section className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6" role="alert">
            <h1 className="text-2xl font-semibold">Handoff policy unavailable</h1>
            <p className="mt-2 text-red-900">
              Current settings could not be verified, so editing is closed. Reload before taking action.
            </p>
          </section>
        ) : (
          <section className="mt-8 rounded-xl border border-stone-200 bg-white p-6 sm:p-8">
            <h1 className="text-3xl font-semibold tracking-tight">
              {result.policy.cameraName} availability
            </h1>
            <HandoffPolicyForm policy={result.policy} />
          </section>
        )}
      </main>
    </div>
  );
}
