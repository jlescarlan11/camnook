import { ArrowLeftIcon } from "@radix-ui/react-icons";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { SiteHeader } from "./site-header";
import { CheckoutSummaryDisclosure } from "./checkout-summary-disclosure";

export type CheckoutSummary = {
  cameraName: string;
  photo?: { alt: string; url: string };
  pickup: string;
  returnDate: string;
  rentalAmount: string;
  securityDeposit: string;
  totalDue: string;
};

export function CheckoutLayout({ children, returnHref, summary }: {
  children: ReactNode;
  returnHref: string;
  summary: CheckoutSummary;
}) {
  return <div className="checkout-page">
    <SiteHeader />
    <main className="checkout-layout">
      <aside className="checkout-summary" aria-label="Rental summary">
        <div className="checkout-summary-inner">
          <p className="checkout-eyebrow">Your rental</p>
          <h2 className="checkout-camera-name">{summary.cameraName}</h2>
          <CheckoutSummaryDisclosure total={summary.totalDue}>
          {summary.photo ? <div className="checkout-camera-photo">
            <Image alt={summary.photo.alt} src={summary.photo.url} fill preload sizes="(max-width: 767px) 240px, 45vw" className="object-contain" />
          </div> : null}
          <div className="checkout-dates">
            <dl><dt>Pickup</dt><dd>{summary.pickup}</dd></dl>
            <dl><dt>Return</dt><dd>{summary.returnDate}</dd></dl>
            <div className="checkout-date-actions"><span>Philippine time (PHT)</span><Link href={returnHref}>Change dates</Link></div>
          </div>
          <dl className="checkout-costs">
            <div><dt>Rental subtotal</dt><dd>{summary.rentalAmount}</dd></div>
            <div><dt>Security deposit</dt><dd>{summary.securityDeposit}</dd></div>
            <div className="checkout-total"><dt>Estimated total</dt><dd>{summary.totalDue}</dd></div>
          </dl>
          <p className="checkout-estimate">Estimate only—not reserved. Subject to owner review and availability.</p>
          </CheckoutSummaryDisclosure>
        </div>
      </aside>
      <div className="checkout-content">
        <Link className="checkout-back" href={returnHref}><ArrowLeftIcon aria-hidden="true" />Back to camera</Link>
        <h1 className="checkout-title">Rental checkout</h1>
        {children}
      </div>
    </main>
  </div>;
}
