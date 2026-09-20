import Link from "next/link";

export function CheckoutProgress({ step, editHref, onDetails }: {
  step: 1 | 2 | 3;
  editHref?: string;
  onDetails?: () => void;
}) {
  return <ol className="checkout-progress" aria-label="Checkout progress">
    {(["Details", "Address", "Review"] as const).map((label, index) => {
      const number = index + 1;
      const content = <><span aria-hidden="true">{number}</span> {label}</>;
      return <li key={label} aria-current={step === number ? "step" : undefined} data-complete={number < step || undefined}>
        {editHref && number < 3
          ? <Link href={`${editHref}&edit=${label.toLowerCase()}`}>{content}</Link>
          : onDetails && number === 1 && step === 2
            ? <button type="button" onClick={onDetails}>{content}</button>
            : <span>{content}</span>}
      </li>;
    })}
  </ol>;
}
