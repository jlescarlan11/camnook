import { CameraMeetupPlacesForm } from "@/features/meetups/place-forms";
import { placeSchema } from "@/features/meetups/places";
import { z } from "zod";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/features/bookings/components/site-header";
import { loadAdminCameraHandoffPolicy } from "@/features/listings/handoff-data";
import { HandoffPolicyForm } from "@/features/listings/handoff-policy-form";
import { BlockDatesForm, CameraDetailsForm, CameraDetailsContinueButton, CameraPhotoForm, PublishCameraForm } from "@/features/listings/owner-camera-forms";
import { OwnerManualBlocks } from "@/features/listings/owner-manual-blocks";
import { loadOwnerCamera, loadOwnerManualBlocks } from "@/features/listings/owner-data";
import { OwnerNav } from "@/features/listings/owner-nav";
import { requirePageAdmin } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export default async function ManageCameraPage({ params, searchParams }: { params: Promise<{ cameraId: string }>; searchParams: Promise<{ step?: string }> }) {
  const [{ cameraId }, query] = await Promise.all([params, searchParams]);
  const context = await requirePageAdmin(`/admin/cameras/${cameraId}`);
  const [result, policyResult] = await Promise.all([loadOwnerCamera(context, cameraId), loadAdminCameraHandoffPolicy(context, cameraId)]);
  if (result.status === "missing" || policyResult.status === "missing") notFound();
  if (result.status === "error" || policyResult.status !== "success") return <div className="min-h-screen bg-stone-50"><SiteHeader /><main className="mx-auto max-w-3xl px-5 py-10"><p className="rounded-xl border border-red-200 bg-red-50 p-5" role="alert">This camera could not be loaded.</p></main></div>;
  const camera = result.camera;
  const step = ["camera", "availability", "preview"].includes(query.step ?? "") ? query.step! : camera.handoff?.enabled ? "preview" : "camera";
  const blocks = step === "availability" ? await loadOwnerManualBlocks(context, cameraId) : null;
  const [placeResult, assignmentResult] = await Promise.all([
    context.supabase.from("meetup_places").select("*").is("archived_at", null).order("name"),
    context.supabase.from("camera_meetup_places").select("place_id,display_order").eq("camera_id", cameraId).order("display_order"),
  ]);
  const parsedPlaces = z.array(placeSchema).safeParse(placeResult.data);
  const places = parsedPlaces.success ? parsedPlaces.data : [];
  const selected = (assignmentResult.data ?? []).map(row => row.place_id).filter(id => places.some(p => p.id === id));
  const placesReady = !placeResult.error && !assignmentResult.error && parsedPlaces.success;
  const ready = { meetups: placesReady && selected.length > 0, availability: Boolean(camera.handoff?.enabled), deposit: camera.security_deposit >= 0, photos: camera.photo_count > 0, price: camera.daily_rate >= 0 };
  return <div className="min-h-screen bg-stone-50 text-stone-950"><SiteHeader /><main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12"><OwnerNav current="cameras" /><Link className="mt-6 inline-flex min-h-11 items-center font-semibold text-[#0b4f9c] underline" href="/admin/cameras">← Cameras</Link><nav aria-label="Camera setup" className="mt-5 grid grid-cols-3 gap-2 text-sm">{[["camera","1. Camera"],["availability","2. Availability"],["preview","3. Publish"]].map(([key,label]) => <Link aria-current={step === key ? "step" : undefined} className="rounded-xl border border-stone-300 bg-white px-3 py-3 text-center font-semibold aria-[current=step]:bg-stone-950 aria-[current=step]:text-white" href={`/admin/cameras/${camera.id}?step=${key}`} key={key}>{label}</Link>)}</nav>
    {step === "camera" ? <section className="mt-6 rounded-xl border border-stone-200 bg-white p-6 sm:p-8"><h1 className="text-3xl font-semibold">Camera</h1><div className="mt-7"><CameraDetailsForm camera={camera} /><CameraPhotoForm cameraId={camera.id} cameraName={camera.name} photoCount={camera.photo_count} /></div><CameraDetailsContinueButton /></section> : null}
    {step === "availability" ? <section className="mt-6 rounded-xl border border-stone-200 bg-white p-6 sm:p-8"><h1 className="text-3xl font-semibold">Availability</h1><HandoffPolicyForm continueToPreview policy={policyResult.policy}><BlockDatesForm cameraId={camera.id} />{blocks ? <OwnerManualBlocks cameraId={camera.id} result={blocks} /> : null}</HandoffPolicyForm><h2 className="mb-4 mt-10 text-2xl font-semibold">Pickup and return places</h2>{placesReady ? <CameraMeetupPlacesForm cameraId={cameraId} places={places} selected={selected} /> : <p role="alert">Meetup places could not be loaded. Reload to try again.</p>}</section> : null}
    {step === "preview" ? <section className="mt-6 rounded-xl border border-stone-200 bg-white p-6 sm:p-8"><h1 className="text-3xl font-semibold">Publish</h1><article className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-5"><h2 className="text-2xl font-semibold">{camera.name}</h2><details className="mt-3 text-stone-600"><summary className="cursor-pointer font-semibold text-[#0b4f9c]">Description</summary><p className="mt-2 leading-7">{camera.description}</p></details><dl className="mt-4 grid gap-3 sm:grid-cols-2"><Value label="Daily price" value={php(camera.daily_rate)} /><Value label="Deposit" value={php(camera.security_deposit)} /><Value label="Pickup area" value={camera.handoff?.pickup_area ?? "Not set"} /><Value label="Photos" value={String(camera.photo_count)} /></dl></article><ul className="mt-6 space-y-2 text-sm">{Object.entries(ready).map(([key,value]) => <li className={value ? "text-emerald-800" : "text-red-800"} key={key}>{value ? "✓" : "○"} {key === "meetups" ? "Meetup places" : key === "photos" ? "Photos" : key === "price" ? "Price" : key === "deposit" ? "Deposit" : "Availability"}</li>)}</ul>{camera.status === "published" ? <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5"><h2 className="font-semibold text-emerald-950">Published</h2><Link className="font-semibold underline" href={`/cameras/${camera.slug}`}>View listing</Link></div> : <><Link className="mt-4 block underline" href={`/admin/cameras/${camera.id}?step=availability`}>Set availability and meetup places</Link>{ready.meetups ? <PublishCameraForm cameraId={camera.id} /> : <p className="mt-3 text-amber-900">Assign at least one meetup place before publishing.</p>}</>}</section> : null}
  </main></div>;
}

const formatter = new Intl.NumberFormat("en-PH", { currency: "PHP", style: "currency" });
function php(value: number) { return formatter.format(value); }
function Value({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-white p-4"><dt className="text-sm text-stone-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>; }
