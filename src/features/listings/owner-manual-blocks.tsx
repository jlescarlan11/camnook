import { formatManilaDateTime } from "@/features/bookings/manila-time";
import { RemoveCameraBlockForm } from "./owner-camera-forms";
import type { OwnerManualBlocksResult } from "./owner-data";

export function OwnerManualBlocks({ cameraId, result }: { cameraId: string; result: OwnerManualBlocksResult }) {
  return <section className="mt-6 rounded-xl border border-stone-200 p-5" aria-labelledby="manual-blocks-heading">
    <h3 className="font-semibold" id="manual-blocks-heading">Current blocked dates</h3>
    <p className="mt-1 text-sm text-stone-600">Active and upcoming blocks for maintenance or personal use. Booking reservations are managed from Bookings.</p>
    {result.status === "error" ? <div className="mt-4" role="alert">
      <p className="text-sm text-red-800">Blocked dates could not be loaded.</p>
      <form action={`/admin/cameras/${cameraId}`} method="get"><input name="step" type="hidden" value="availability" /><button className="mt-3 min-h-11 font-semibold underline" type="submit">Retry blocked dates</button></form>
    </div> : result.blocks.length === 0 ? <p className="mt-4 text-sm text-stone-600">No active or upcoming blocked dates.</p> : <ul className="mt-4 divide-y divide-stone-200">{result.blocks.map((block) => <li className="py-4" key={block.id}>
      <p className="font-medium">{block.kind === "maintenance" ? "Maintenance" : "Personal use"}</p>
      <p className="mt-1 text-sm text-stone-600">From {formatManilaDateTime(block.starts_at)} until {formatManilaDateTime(block.ends_at)} (Philippine time)</p>
      <RemoveCameraBlockForm cameraId={cameraId} blockId={block.id} />
    </li>)}</ul>}
  </section>;
}
