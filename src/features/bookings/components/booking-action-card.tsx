import { customerNextAction, customerRentalProgress, presentCustomerBookingStatus } from "../customer-status";
import { formatManilaDateTime } from "../manila-time";

export function BookingActionCard({ booking }: { booking: { camera: { name: string }; pickupAt: string; returnAt: string; state: string; requestedAt: string; approval?: { approvalDeadlineAt: string } } }) {
  const next = customerNextAction(booking.state, booking.approval?.approvalDeadlineAt, booking.pickupAt);
  const progress = customerRentalProgress(booking.state);
  return <section className="surface mt-6 overflow-hidden" aria-labelledby="next-step-heading">
    <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="p-6 sm:p-8">
        <p className="text-sm font-semibold text-[#0b4f9c]">{booking.camera.name}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight" id="next-step-heading">{next.title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{next.body}</p>
        {booking.state === "FOR_REVIEW" ? <p className="mt-2 text-sm text-stone-500">{presentCustomerBookingStatus(booking.state, booking.requestedAt, booking.pickupAt).target}</p> : null}
        {next.action ? <a className="button-primary mt-5" href={next.href ?? "#next-action"}>{next.action}</a> : null}
      </div>
      <dl className="border-t border-stone-200 bg-[#edf5ff] p-6 lg:border-l lg:border-t-0 sm:p-8">
        <DetailValue label="Pickup" value={formatManilaDateTime(booking.pickupAt)} />
        <DetailValue label="Return" value={formatManilaDateTime(booking.returnAt)} />
      </dl>
    </div>
    <ol className="grid border-t border-stone-200 text-xs sm:grid-cols-6">
      {progress.map((step) => <li aria-current={step.state === "current" ? "step" : undefined} className={`border-b-2 px-4 py-3 ${step.state === "complete" ? "border-[#6da8e8] text-[#0b4f9c]" : step.state === "current" ? "border-[#081d3b] font-semibold text-stone-950" : "border-transparent text-stone-500"}`} key={step.label}>{step.label}</li>)}
    </ol>
  </section>;
}

export function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-stone-200 py-3">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}
