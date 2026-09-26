/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { PublicHandoffPolicy } from "@/features/listings/handoff-types";
import type { ScheduleSelection } from "../schedule-navigation";
import { ScheduleQuoteForm } from "./schedule-quote-form";

vi.mock("../calendar", async (original) => ({
  ...await original<typeof import("../calendar")>(),
  getManilaToday: () => "2099-08-01",
}));

const cameraPath = "/cameras/test-camera";
const policy: PublicHandoffPolicy = {
  allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
  approvedTimes: ["09:00"],
  approximationLevel: "city_centroid",
  cityLabel: "Cebu City",
  enabled: true,
  timezone: "Asia/Manila",
  version: 1,
};

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

function formWithCurrentSearchParams(activePolicy = policy, initialSchedule?: ScheduleSelection) {
  return <SearchParamsContext value={new URL(window.location.href).searchParams}>
    <ScheduleQuoteForm compact cameraId="11111111-1111-4111-8111-111111111111" cameraName="Test camera" availability={[]} policy={activePolicy} initialSchedule={initialSchedule} />
  </SearchParamsContext>;
}

function renderFromCurrentUrl(activePolicy = policy, initialSchedule?: ScheduleSelection) {
  return render(formWithCurrentSearchParams(activePolicy, initialSchedule));
}

it("restores the completed schedule after returning from sign-in without adding selection history", async () => {
  window.history.replaceState(null, "", `${cameraPath}?source=catalog&source=favorites#rental`);
  const historyLength = window.history.length;
  const form = renderFromCurrentUrl();

  await userEvent.click(screen.getByRole("button", { name: "Pickup date Choose date" }));
  await userEvent.click(screen.getByRole("button", { name: /August 24, 2099, available/ }));
  await userEvent.click(screen.getByRole("button", { name: "Show next month" }));
  await userEvent.click(screen.getByRole("button", { name: /September 2, 2099, available/ }));
  const checkoutHref = screen.getByRole("link", { name: "Continue to checkout" }).getAttribute("href")!;

  expect(window.history.length).toBe(historyLength);
  expect(new URL(window.location.href).searchParams.getAll("source")).toEqual(["catalog", "favorites"]);
  expect(window.location.hash).toBe("#rental");

  form.unmount();
  window.history.pushState(null, "", `/login?${new URLSearchParams({ next: checkoutHref })}`);
  window.history.back();
  await waitFor(() => expect(window.location.pathname).toBe(cameraPath));
  renderFromCurrentUrl();

  expect(screen.getByRole("button", { name: "Pickup date Aug 24, 2099" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Return date Sep 2, 2099" })).toBeTruthy();
  expect((screen.getByRole("combobox", { name: "Handoff time" }) as HTMLSelectElement).value).toBe("09:00");
  expect(screen.getByRole("link", { name: "Continue to checkout" }).getAttribute("href")).toBe(checkoutHref);
});

it("does not restore the old complete range after starting a new pickup selection", async () => {
  const cachedSchedule = { pickupDate: "2099-08-24", returnDate: "2099-08-26", handoffTime: "09:00" };
  window.history.replaceState(null, "", `${cameraPath}?source=catalog&pickupDate=2099-08-24&returnDate=2099-08-26&handoffTime=09%3A00#rental`);
  const form = renderFromCurrentUrl(policy, cachedSchedule);

  await userEvent.click(screen.getByRole("button", { name: "Pickup date Aug 24, 2099" }));
  await userEvent.click(screen.getByRole("button", { name: /August 27, 2099, available/ }));
  expect(screen.queryByRole("link", { name: "Continue to checkout" })).toBeNull();
  form.rerender(formWithCurrentSearchParams(policy, cachedSchedule));
  expect(screen.getByRole("button", { name: "Pickup date Aug 27, 2099" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Return date Choose date" })).toBeTruthy();
  form.unmount();
  renderFromCurrentUrl(policy, cachedSchedule);

  expect(screen.getByRole("button", { name: "Pickup date Choose date" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Return date Choose date" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Continue to checkout" })).toBeNull();
  expect(window.location.search).toBe("?source=catalog");
  expect(window.location.hash).toBe("#rental");
});

it("retains a changed handoff time on reload and clears recovery when the time is unselected", async () => {
  const multiTimePolicy = { ...policy, approvedTimes: ["09:00", "17:00"] };
  const cachedSchedule = { pickupDate: "2099-08-24", returnDate: "2099-08-26", handoffTime: "09:00" };
  window.history.replaceState(null, "", `${cameraPath}?pickupDate=2099-08-24&returnDate=2099-08-26&handoffTime=09%3A00`);
  const form = renderFromCurrentUrl(multiTimePolicy, cachedSchedule);

  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Handoff time" }), "17:00");
  form.unmount();
  const restored = renderFromCurrentUrl(multiTimePolicy, cachedSchedule);
  expect((screen.getByRole("combobox", { name: "Handoff time" }) as HTMLSelectElement).value).toBe("17:00");

  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Handoff time" }), "");
  restored.unmount();
  renderFromCurrentUrl(multiTimePolicy, cachedSchedule);
  expect(screen.getByRole("button", { name: "Pickup date Choose date" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Continue to checkout" })).toBeNull();
  expect(window.location.search).toBe("");
});
