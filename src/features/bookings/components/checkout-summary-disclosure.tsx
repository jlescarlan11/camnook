"use client";

import { ChevronDownIcon, ChevronUpIcon } from "@radix-ui/react-icons";
import { useId, useState, type ReactNode } from "react";

export function CheckoutSummaryDisclosure({ children, total }: { children: ReactNode; total: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return <>
    <button className="checkout-summary-toggle" type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>
      <span>{expanded ? "Hide rental summary" : "Show rental summary"}{expanded ? <ChevronUpIcon aria-hidden="true" /> : <ChevronDownIcon aria-hidden="true" />}</span>
      <strong><span className="checkout-mobile-total-label">Estimated total</span>{total}</strong>
    </button>
    <div className="checkout-summary-details" id={id} data-expanded={expanded}>{children}</div>
  </>;
}
