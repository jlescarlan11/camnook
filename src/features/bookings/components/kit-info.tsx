"use client";

import { InfoCircledIcon } from "@radix-ui/react-icons";
import { useEffect, useId, useRef, useState } from "react";

export function KitInfo({ name, description, pickup }: { name: string; description: string; pickup: string | null }) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) {
        setOpen(false);
        setPinned(false);
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  return (
    <div
      className="kit-info"
      ref={container}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => { if (!pinned) setOpen(false); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { setOpen(false); setPinned(false); }
      }}
    >
      <button
        aria-label={`Details for ${name}`}
        aria-describedby={open ? id : undefined}
        className="kit-info-button"
        onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); setPinned(false); }}
        onClick={() => { setPinned(!pinned); setOpen(!pinned); }}
        type="button"
      >
        <InfoCircledIcon aria-hidden="true" width={16} height={16} />
      </button>
      {open ? (
        <div className="kit-info-tooltip" id={id} role="tooltip">
          <div className="kit-info-content">
            <strong>What’s included</strong>
            <p>{description}</p>
            <p className="kit-info-pickup"><strong>Pickup</strong><br />{pickup ?? "Handoff area unavailable"}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
