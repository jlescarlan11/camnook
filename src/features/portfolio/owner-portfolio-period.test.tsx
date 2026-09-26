/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { OwnerPortfolioPanel } from "./owner-dashboard";

afterEach(cleanup);

const initialPeriod = { startDate: "2026-09-01", endDateExclusive: "2026-09-27" };
const editedPeriod = { startDate: "2026-01-01", endDateExclusive: "2026-02-01" };

function dates() {
  return {
    start: screen.getByLabelText("Start date") as HTMLInputElement,
    end: screen.getByLabelText("End date (excluded)") as HTMLInputElement,
  };
}

it.each([
  { startDate: "2026-09-27", endDateExclusive: "2026-09-27", invalid: true },
  { startDate: "2026-08-01", endDateExclusive: "2026-09-01", invalid: false },
])("restores applied filter values when navigation changes the report period: $startDate", (previous) => {
  const { rerender } = render(<OwnerPortfolioPanel invalidPeriod={false} period={initialPeriod} report={null} />);
  fireEvent.change(dates().start, { target: { value: editedPeriod.startDate } });
  fireEvent.change(dates().end, { target: { value: editedPeriod.endDateExclusive } });
  rerender(<OwnerPortfolioPanel invalidPeriod={false} period={editedPeriod} report={null} />);

  // Back navigates to an earlier applied period after these inputs were edited.
  rerender(<OwnerPortfolioPanel invalidPeriod={previous.invalid} period={previous} report={null} />);
  expect(dates().start.value).toBe(previous.startDate);
  expect(dates().end.value).toBe(previous.endDateExclusive);
  expect(new FormData(dates().start.form!).get("start")).toBe(previous.startDate);
  expect(new FormData(dates().end.form!).get("end")).toBe(previous.endDateExclusive);

  // Forward restores the later period too.
  rerender(<OwnerPortfolioPanel invalidPeriod={false} period={editedPeriod} report={null} />);
  expect(dates().start.value).toBe("2026-01-01");
  expect(dates().end.value).toBe("2026-02-01");
});

it("preserves pending filter edits when the applied period has not changed", () => {
  const { rerender } = render(<OwnerPortfolioPanel invalidPeriod={false} period={initialPeriod} report={null} />);
  fireEvent.change(dates().start, { target: { value: "2026-08-01" } });
  fireEvent.change(dates().end, { target: { value: "2026-09-01" } });
  rerender(<OwnerPortfolioPanel invalidPeriod={false} period={{ ...initialPeriod }} report={null} />);
  expect(dates().start.value).toBe("2026-08-01");
  expect(dates().end.value).toBe("2026-09-01");
});

it("restores applied dates when the browser restores a cached document", () => {
  render(<OwnerPortfolioPanel invalidPeriod={false} period={initialPeriod} report={null} />);
  fireEvent.change(dates().start, { target: { value: "2026-01-01" } });
  fireEvent.change(dates().end, { target: { value: "2026-02-01" } });
  act(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false })));
  expect(dates().start.value).toBe("2026-01-01");
  act(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  expect(dates().start.value).toBe("2026-09-01");
  expect(dates().end.value).toBe("2026-09-27");
});
