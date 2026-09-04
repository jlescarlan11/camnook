"use client";

import { useActionState } from "react";
import {
  createCameraDraft,
  blockCameraDates,
  publishCamera,
  updateCameraDraft,
  uploadCameraPhoto,
  type CameraActionState,
} from "./owner-actions";

const initial: CameraActionState = { status: "idle" };
const inputClass = "mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-amber-700 focus:ring-4 focus:ring-amber-100";

export function CameraDetailsForm({ camera }: {
  camera?: { accessories: { name: string }[]; daily_rate: number; description: string | null; id: string; name: string; security_deposit: number };
}) {
  const [state, action, pending] = useActionState(camera ? updateCameraDraft : createCameraDraft, initial);
  return <form action={action} className="space-y-5">
    {camera ? <input name="cameraId" type="hidden" value={camera.id} /> : null}
    <Field label="Camera name"><input className={inputClass} defaultValue={camera?.name} maxLength={160} name="name" required /></Field>
    <Field label="Description"><textarea className={`${inputClass} min-h-32`} defaultValue={camera?.description ?? ""} maxLength={2000} name="description" required /></Field>
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Daily price"><input className={inputClass} defaultValue={camera?.daily_rate} min="0" name="dailyRate" required step="0.01" type="number" /></Field>
      <Field label="Deposit"><input className={inputClass} defaultValue={camera?.security_deposit} min="0" name="deposit" required step="0.01" type="number" /></Field>
    </div>
    <Field label="What’s included" help="One item per line. Each item is included once.">
      <textarea className={`${inputClass} min-h-28`} defaultValue={camera?.accessories.map((item) => item.name).join("\n")} name="included" placeholder={"Battery\nCharger\nCamera bag"} />
    </Field>
    <ActionMessage state={state} success="Camera details saved." />
    <button className="min-h-12 w-full rounded-xl bg-stone-950 px-5 py-3 font-semibold text-white disabled:opacity-60" disabled={pending} type="submit">{pending ? "Saving…" : camera ? "Save camera" : "Save & continue"}</button>
  </form>;
}

export function CameraPhotoForm({ cameraId, cameraName, photoCount }: { cameraId: string; cameraName: string; photoCount: number }) {
  const [state, action, pending] = useActionState(uploadCameraPhoto, initial);
  return <form action={action} className="mt-6 rounded-2xl border border-stone-200 p-5">
    <input name="cameraId" type="hidden" value={cameraId} />
    <input name="cameraName" type="hidden" value={cameraName} />
    <input name="sortPosition" type="hidden" value={photoCount} />
    <label className="block font-semibold">Photos <span className="font-normal text-stone-500">({photoCount} added)</span>
      <input accept="image/jpeg,image/png,image/webp" className={inputClass} name="photo" required type="file" />
    </label>
    <p className="mt-2 text-xs text-stone-500">JPEG, PNG, or WebP up to 10 MB.</p>
    <ActionMessage state={state} success="Photo added." />
    <button className="mt-4 min-h-11 rounded-xl border border-stone-900 px-4 py-2 font-semibold disabled:opacity-60" disabled={pending} type="submit">{pending ? "Adding photo…" : "Add photo"}</button>
  </form>;
}

export function PublishCameraForm({ cameraId }: { cameraId: string }) {
  const [state, action, pending] = useActionState(publishCamera, initial);
  return <form action={action} className="mt-6">
    <input name="cameraId" type="hidden" value={cameraId} />
    <ActionMessage state={state} success="Camera published." />
    <button className="min-h-12 w-full rounded-xl bg-amber-500 px-5 py-3 font-semibold text-stone-950 disabled:opacity-60" disabled={pending} type="submit">{pending ? "Publishing…" : "Publish camera"}</button>
  </form>;
}

export function BlockDatesForm({ cameraId }: { cameraId: string }) {
  const [state, action, pending] = useActionState(blockCameraDates, initial);
  return <form action={action} className="mt-6 rounded-2xl border border-stone-200 p-5">
    <input name="cameraId" type="hidden" value={cameraId} />
    <h3 className="font-semibold">Blocked dates</h3>
    <p className="mt-1 text-sm text-stone-600">Keep the camera unavailable for maintenance or personal use.</p>
    <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="From"><input className={inputClass} name="startDate" required type="date" /></Field><Field label="Through"><input className={inputClass} name="endDate" required type="date" /></Field></div>
    <ActionMessage state={state} success="Dates blocked." />
    <button className="mt-4 min-h-11 rounded-xl border border-stone-900 px-4 py-2 font-semibold disabled:opacity-60" disabled={pending} type="submit">{pending ? "Saving…" : "Block dates"}</button>
  </form>;
}

function Field({ children, help, label }: { children: React.ReactNode; help?: string; label: string }) {
  return <label className="block text-sm font-medium">{label}{children}{help ? <span className="mt-2 block text-xs font-normal text-stone-500">{help}</span> : null}</label>;
}

function ActionMessage({ state, success }: { state: CameraActionState; success: string }) {
  return state.status === "idle" ? null : <p className={`rounded-xl border p-3 text-sm ${state.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`} role={state.status === "success" ? "status" : "alert"}>{state.status === "success" ? success : state.error}</p>;
}
