"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function PortfolioPeriodForm({ children, periodKey }: { children: ReactNode; periodKey: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    function restoreAppliedPeriod(event: PageTransitionEvent) {
      // A history snapshot includes drafts typed before leaving this report.
      if (event.persisted) formRef.current?.reset();
    }
    window.addEventListener("pageshow", restoreAppliedPeriod);
    return () => window.removeEventListener("pageshow", restoreAppliedPeriod);
  }, []);

  return (
    <form
      className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto]"
      key={periodKey}
      method="get"
      ref={formRef}
    >
      {children}
    </form>
  );
}
