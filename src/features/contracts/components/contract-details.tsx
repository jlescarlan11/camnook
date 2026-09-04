import type { ContractHistoryDTO } from "../data";
import { formatManilaDateTime } from "../../bookings/manila-time";

const phpFormatter = new Intl.NumberFormat("en-PH", {
  currency: "PHP",
  style: "currency",
});

const termLabels = {
  cancellation: "Cancellation",
  damage: "Damage",
  loss: "Loss",
  "late-return": "Late return",
  "non-transferability": "Non-transferability",
  pickup: "Pickup",
  return: "Return",
} as const;

export function ContractDetails({
  agreement,
  approvalDeadlineAt,
}: {
  agreement: ContractHistoryDTO;
  approvalDeadlineAt: string;
}) {
  const contract = agreement.current;
  const { snapshot } = contract;

  return (
    <section
      aria-labelledby="agreement-heading"
      className="mt-7 border-t border-stone-200 pt-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold" id="agreement-heading">
            Rental agreement · version {contract.versionNo}
          </h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Review this immutable version. Every value below was fixed when it
            was issued and is not taken from editable form fields.
          </p>
        </div>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-semibold text-stone-800">
          {contract.status}
          {contract.signature ? " · signed" : " · unsigned"}
        </span>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="Renter legal name" value={snapshot.renter.legal_name} />
        <Detail label="Renter phone" value={snapshot.renter.phone} />
        {snapshot.renter.birth_date ? <Detail label="Renter birthdate" value={snapshot.renter.birth_date} /> : null}
        {snapshot.renter.address ? (
          <Detail
            label="Renter residential address"
            value={`${snapshot.renter.address.line1}, ${[...snapshot.renter.address.path].reverse().map((area) => area.name).join(", ")}`}
          />
        ) : null}
        <Detail label="Camera" value={snapshot.camera.name} />
        <Detail label="Camera serial" value={snapshot.camera.serial_number} />
        <Detail
          label="Pickup (Asia/Manila)"
          value={formatManilaDateTime(snapshot.booking.pickup_at)}
        />
        <Detail
          label="Return (Asia/Manila)"
          value={formatManilaDateTime(snapshot.booking.return_at)}
        />
        <Detail label="Intended use" value={snapshot.booking.intended_use} />
        <Detail
          label="Expected location"
          value={snapshot.booking.expected_location}
        />
        <Detail
          label="Daily rate"
          value={phpFormatter.format(snapshot.pricing.daily_rate)}
        />
        <Detail
          label="Billable days"
          value={String(snapshot.pricing.billable_days)}
        />
        <Detail
          label="Rental amount"
          value={phpFormatter.format(snapshot.pricing.rental_amount)}
        />
        <Detail
          label="Security deposit"
          value={phpFormatter.format(snapshot.pricing.security_deposit)}
        />
        <Detail
          label="Total due"
          value={phpFormatter.format(snapshot.pricing.total_due)}
        />
        <Detail label="Currency" value={snapshot.pricing.currency} />
        <Detail
          label="Original approval deadline"
          value={formatManilaDateTime(approvalDeadlineAt)}
        />
        <Detail
          label="Issued (Asia/Manila)"
          value={formatManilaDateTime(contract.issuedAt)}
        />
        <Detail
          label="Terms template"
          value={`${snapshot.template.version} · schema ${snapshot.template.schema_version}`}
        />
        {contract.signature ? (
          <Detail
            label="Signed (Asia/Manila)"
            value={formatManilaDateTime(contract.signature.signedAt)}
          />
        ) : null}
      </dl>

      {snapshot.meetup ? (
        <section className="mt-6" aria-labelledby="contract-meetup-heading">
          <h3 className="font-semibold" id="contract-meetup-heading">
            Planned pickup and return meetup
          </h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <Detail label="Renter city" value={snapshot.meetup.renter_city} />
            {snapshot.meetup.kind === "public_venue" ? <>
              <Detail label="Public venue" value={snapshot.meetup.venue_name} />
              <Detail label="Venue address" value={snapshot.meetup.venue_address} />
              <Detail label="Venue city" value={snapshot.meetup.venue_city} />
            </> : (
              <Detail label="Venue status" value="Exact public venue pending owner confirmation" />
            )}
          </dl>
          {snapshot.meetup.kind === "public_venue" ? <p className="mt-3 text-xs text-stone-500">{snapshot.meetup.attribution}</p> : null}
        </section>
      ) : null}

      <section className="mt-6" aria-labelledby="inclusions-heading">
        <h3 className="font-semibold" id="inclusions-heading">
          Fixed inclusions
        </h3>
        {snapshot.camera.accessories.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">No inclusions.</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {snapshot.camera.accessories.map((accessory) => (
              <li className="rounded-xl bg-stone-50 p-4" key={accessory.id}>
                {accessory.name} × {accessory.quantity}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6" aria-labelledby="terms-heading">
        <h3 className="font-semibold" id="terms-heading">
          Required terms
        </h3>
        <dl className="mt-3 space-y-3">
          {Object.entries(termLabels).map(([key, label]) => (
            <div className="rounded-xl bg-stone-50 p-4" key={key}>
              <dt className="font-semibold">{label}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-stone-700">
                {termText(
                  snapshot.template.terms[
                    key as keyof typeof snapshot.template.terms
                  ],
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <details className="mt-6 rounded-xl border border-stone-200 p-4">
        <summary className="cursor-pointer font-semibold">
          Agreement version history
        </summary>
        <ol className="mt-4 space-y-3">
          {agreement.versions.map((version) => (
            <li className="text-sm leading-6" key={version.id}>
              <span className="font-semibold">Version {version.versionNo}</span>
              {" · "}
              {version.status}
              {" · issued "}
              {formatManilaDateTime(version.issuedAt)}
              {version.signature
                ? ` · signed ${formatManilaDateTime(version.signature.signedAt)}`
                : " · unsigned"}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-stone-50 p-4">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}

function termText(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
