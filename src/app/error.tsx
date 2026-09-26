"use client";

import Link from "next/link";
import { SiteHeader } from "@/features/bookings/components/site-header";

export default function PageError({ retry }: { retry: () => void }) {
  return (
    <div className="min-h-screen bg-white text-[#081d3b]">
      <SiteHeader />
      <main className="page-shell py-8 sm:py-12">
        <h1 className="page-title">We couldn’t load this page</h1>
        <p className="mt-4 max-w-xl text-[#58677d]">
          There may be a temporary connection problem. Try loading this page again.
        </p>
        <div className="mt-6 flex flex-wrap gap-4">
          <button className="button-primary" onClick={retry} type="button">Try again</button>
          <Link className="button-secondary" href="/">Browse cameras</Link>
        </div>
      </main>
    </div>
  );
}
