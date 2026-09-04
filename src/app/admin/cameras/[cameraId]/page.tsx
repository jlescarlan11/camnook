import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { loadAdminCameraHandoffPolicy } from "@/features/listings/handoff-data";
import { HandoffPolicyForm } from "@/features/listings/handoff-policy-form";
import { BlockDatesForm, CameraDetailsForm, CameraPhotoForm, PublishCameraForm } from "@/features/listings/owner-camera-forms";
import { loadOwnerCamera } from "@/features/listings/owner-data";
import { OwnerNav } from "@/features/listings/owner-nav";
import { requirePageAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function ManageCameraPage({ params, searchParams }: { params: Promise<{ cameraId: string }>; searchParams: Promise<{ step?: string }> }) {
  const [{ cameraId }, query] = await Promise.all([params, searchParams]);
  const context = await requirePageAdmin(`/admin/cameras/${cameraId}`);
  const [result, policyResult] = await Promise.all([loadOwnerCamera(context, cameraId), loadAdminCameraHandoffPolicy(context, cameraId)]);
  if (result.status === "missing" || policyResult.status === "missing") notFound();
  if (result.status === "error" || policyResult.status !== "success") return <div className="min-h-screen bg-stone-100"><SiteHeader /><main className="mx-auto max-w-3xl px-5 py-10"><p className="rounded-xl border border-red-200 bg-red-50 p-5" role="alert">This camera could not be loaded.</p></main></div>;
  const camera = result.camera;
  const step = ["camera", "availability", "preview"].includes(query.step ?? "") ? query.step! : camera.handoff?.enabled ? "preview" : "camera";
  const ready = { availability: Boolean(camera.handoff?.enabled), deposit: camera.security_deposit >= 0, photos: camera.photo_count > 0, price: camera.daily_rate >= 0 };
  return <div className="min-h-screen bg-stone-100 text-stone-950"><SiteHeader /><main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12"><OwnerNav current="cameras" /><Link className="mt-6 inline-flex min-h-11 items-center font-semibold text-amber-900 underline" href="/admin/cameras">← Back to cameras</Link><nav aria-label="Camera setup" className="mt-5 grid grid-cols-3 gap-2 text-sm">{[["camera","1. Camera"],["availability","2. Availability"],["preview","3. Preview & publish"]].map(([key,label]) => <Link aria-current={step === key ? "step" : undefined} className="rounded-xl border border-stone-300 bg-white px-3 py-3 text-center font-semibold aria-[current=step]:bg-stone-950 aria-[current=step]:text-white" href={`/admin/cameras/${camera.id}?step=${key}`} key={key}>{label}</Link>)}</nav>
    {step === "camera" ? <section className="mt-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">Step 1 of 4</p><h1 className="mt-2 text-3xl font-semibold">Camera</h1><div className="mt-7"><CameraDetailsForm camera={camera} /><CameraPhotoForm cameraId={camera.id} cameraName={camera.name} photoCount={camera.photo_count} /></div><Link className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-stone-950 px-5 py-3 font-semibold text-white" href={`/admin/cameras/${camera.id}?step=availability`}>Continue to availability</Link></section> : null}
    {step === "availability" ? <section className="mt-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">Step 2 of 4</p><h1 className="mt-2 text-3xl font-semibold">Availability</h1><p className="mt-2 text-stone-600">Set the pickup area, available days, and handoff times renters can actually choose.</p><HandoffPolicyForm policy={policyResult.policy} /><BlockDatesForm cameraId={camera.id} /><Link className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-stone-950 px-5 py-3 font-semibold text-white" href={`/admin/cameras/${camera.id}?step=preview`}>Continue to preview</Link></section> : null}
    {step === "preview" ? <section className="mt-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">Steps 3 &amp; 4</p><h1 className="mt-2 text-3xl font-semibold">Preview &amp; publish</h1><article className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-5"><p className="text-sm font-semibold text-amber-800">Renter listing preview</p><h2 className="mt-2 text-2xl font-semibold">{camera.name}</h2><p className="mt-3 leading-7 text-stone-600">{camera.description}</p><dl className="mt-4 grid gap-3 sm:grid-cols-2"><Value label="Daily price" value={php(camera.daily_rate)} /><Value label="Deposit" value={php(camera.security_deposit)} /><Value label="Pickup area" value={camera.handoff?.pickup_area ?? "Not set"} /><Value label="Photos" value={String(camera.photo_count)} /></dl></article><ul className="mt-6 space-y-2 text-sm">{Object.entries(ready).map(([key,value]) => <li className={value ? "text-emerald-800" : "text-red-800"} key={key}>{value ? "✓" : "○"} {key === "photos" ? "Photos added" : key === "price" ? "Price configured" : key === "deposit" ? "Deposit configured" : "Availability configured"}</li>)}</ul>{camera.status === "published" ? <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5"><h2 className="font-semibold text-emerald-950">Camera published</h2><div className="mt-4 flex gap-3"><Link className="font-semibold underline" href={`/cameras/${camera.slug}`}>View listing</Link><Link className="font-semibold underline" href="/admin/cameras">Back to cameras</Link></div></div> : <PublishCameraForm cameraId={camera.id} />}</section> : null}
  </main></div>;
}

const formatter = new Intl.NumberFormat("en-PH", { currency: "PHP", style: "currency" });
function php(value: number) { return formatter.format(value); }
function Value({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-white p-4"><dt className="text-sm text-stone-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>; }
