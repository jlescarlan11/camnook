"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

export function ProfileSaveFeedback({ children }: { children: ReactNode }) {
  const query = useSearchParams();
  const saved = query.getAll("saved");

  function clearAcknowledgement() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("saved")) return;
    url.searchParams.delete("saved");
    // Next synchronizes native history with useSearchParams without replacing
    // the editor or discarding its uncontrolled field values.
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  return <div onChangeCapture={clearAcknowledgement} onSubmitCapture={clearAcknowledgement}
    onClickCapture={(event) => {
      if (event.target instanceof Element && event.target.closest("form")) clearAcknowledgement();
    }}>
    {saved.length === 1 && saved[0] === "1" ? (
      <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
        Your renter details were saved.
      </p>
    ) : null}
    {children}
  </div>;
}
