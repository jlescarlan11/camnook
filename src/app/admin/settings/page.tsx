import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteHeader } from "@/features/bookings/components/site-header";
import { ContractTemplateForm } from "@/features/contracts/components/contract-template-form";
import { loadContractTemplateConfiguration } from "@/features/contracts/template-data";
import { loadAdminDashboardContext } from "@/features/portfolio/data";
import { GcashConfigurationForm } from "@/features/payments/gcash-configuration-form";
import { requirePageUser } from "@/lib/auth/require-user";

import { AdminNav } from "../page";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const context = await requirePageUser("/admin/settings");
  const [data, template] = await Promise.all([
    loadAdminDashboardContext(context, null),
    loadContractTemplateConfiguration(context),
  ]);
  if ("forbidden" in data || template.status === "forbidden") {
    redirect("/forbidden");
  }

  return (
    <div className="min-h-screen bg-stone-100">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <AdminNav current="settings" />
        <h1 className="mt-6 text-4xl font-semibold">Settings</h1>
        <section id="payments">
          {data.gcashConfiguration.status === "success" ? (
            <GcashConfigurationForm
              configuration={data.gcashConfiguration.configuration}
            />
          ) : (
            <p className="mt-6" role="alert">
              Payment configuration is unavailable.
            </p>
          )}
        </section>
        {template.status === "success" ? (
          <ContractTemplateForm configuration={template.configuration} />
        ) : (
          <section
            className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900"
            id="contracts"
            role="alert"
          >
            <h2 className="text-xl font-semibold">Contract template</h2>
            <p className="mt-2">Contract template configuration is unavailable.</p>
          </section>
        )}
        <section
          className="mt-8 rounded-2xl border border-stone-200 bg-white p-6"
          id="handoffs"
        >
          <h2 className="text-xl font-semibold">Camera handoff policies</h2>
          {data.handoffPolicies.status === "success" ? (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {data.handoffPolicies.cameras.map((camera) => (
                <li className="rounded-xl border p-4" key={camera.cameraId}>
                  <strong>{camera.cameraName}</strong>
                  <p className="text-sm text-stone-600">
                    {camera.cityLabel ?? "Not configured"} ·{" "}
                    {camera.enabled ? "Enabled" : "Disabled"}
                  </p>
                  <Link
                    className="mt-2 inline-flex min-h-11 items-center font-semibold text-amber-900 underline"
                    href={`/admin/cameras/${camera.cameraId}/handoff`}
                  >
                    Configure handoffs
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p role="alert">Handoff settings are unavailable.</p>
          )}
        </section>
      </main>
    </div>
  );
}
