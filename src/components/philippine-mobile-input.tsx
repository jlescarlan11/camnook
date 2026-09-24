"use client";

import { useId } from "react";

import { mobileInputDigits } from "@/lib/phone/philippine-mobile";

type Props = {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
  className?: string;
  defaultValue?: string;
  id?: string;
  name: string;
  onChange?: (digits: string) => void;
  required?: boolean;
  value?: string;
};

export function PhilippineMobileInput({
  "aria-describedby": describedBy,
  className = "", defaultValue, id, name, onChange, required = false, value,
  ...aria
}: Props) {
  const prefixDescriptionId = useId();
  return (
    <span className={`mt-2 flex w-full overflow-hidden rounded-lg border border-stone-300 bg-white focus-within:border-[#0b4f9c] focus-within:ring-4 focus-within:ring-[#c9dcfb] ${className}`}>
      <span aria-hidden="true" className="flex items-center border-r border-stone-300 bg-stone-50 px-4 text-base text-stone-700">+63</span>
      <span className="sr-only" id={prefixDescriptionId}>Country code +63 is included automatically.</span>
      <input
        {...aria}
        aria-describedby={[describedBy, prefixDescriptionId].filter(Boolean).join(" ")}
        autoComplete="tel-national"
        className="min-w-0 flex-1 bg-white px-4 py-3 text-base outline-none"
        defaultValue={defaultValue === undefined ? undefined : mobileInputDigits(defaultValue)}
        id={id}
        inputMode="numeric"
        maxLength={32}
        name={name}
        onChange={(event) => {
          const digits = mobileInputDigits(event.currentTarget.value);
          if (onChange) onChange(digits);
          else event.currentTarget.value = digits;
        }}
        pattern="9[0-9]{9}"
        placeholder="9XX XXX XXXX"
        required={required}
        type="tel"
        value={value === undefined ? undefined : mobileInputDigits(value)}
      />
    </span>
  );
}
