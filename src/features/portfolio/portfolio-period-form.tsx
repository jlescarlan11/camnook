import type { ReactNode } from "react";
import { AppliedFiltersForm } from "@/components/applied-filters-form";

export function PortfolioPeriodForm({ children, periodKey }: { children: ReactNode; periodKey: string }) {
  return (
    <AppliedFiltersForm
      className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto]"
      filtersKey={periodKey}
    >
      {children}
    </AppliedFiltersForm>
  );
}
