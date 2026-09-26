"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function AppliedFiltersForm({ children, filtersKey, className }: {
  children: ReactNode;
  filtersKey: string;
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    function restoreAppliedFilters(event: PageTransitionEvent) {
      // History snapshots can include drafts typed before leaving the results.
      if (event.persisted) formRef.current?.reset();
    }
    window.addEventListener("pageshow", restoreAppliedFilters);
    return () => window.removeEventListener("pageshow", restoreAppliedFilters);
  }, []);

  return <form className={className} key={filtersKey} method="get" ref={formRef}>{children}</form>;
}
