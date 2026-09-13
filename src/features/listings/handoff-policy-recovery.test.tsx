/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const { save } = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("./handoff-actions", () => ({ saveCameraHandoffPolicy: save }));
vi.mock("@/features/locations/psgc-area-selector", () => ({ PsgcAreaSelector: () => <p>Saved pickup area</p> }));
import { HandoffPolicyForm } from "./handoff-policy-form";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("preserves weekdays, enabled state, and time edits when correcting a validation error", async () => {
  const intents: (FormDataEntryValue | null)[] = [];
  const submissions: { weekdays: FormDataEntryValue[]; enabled: FormDataEntryValue | null; times: FormDataEntryValue | null }[] = [];
  save.mockImplementation(async (_state, data: FormData) => {
    intents.push(data.get("intent"));
    submissions.push({ weekdays: data.getAll("weekdays"), enabled: data.get("enabled"), times: data.get("approvedTimes") });
    return submissions.length === 1 ? { status: "error", error: "invalid_input", fieldErrors: { approvedTimes: "Enter valid times." } } : { status: "success", version: 3, cityLabel: "Synthetic area" };
  });
  render(<HandoffPolicyForm continueToPreview policy={{ allowedWeekdays: [1], approvedTimes: ["09:00"], enabled: true, timezone: "Asia/Manila", version: 2, cityLabel: "Synthetic area", cameraId: "11111111-1111-4111-8111-111111111111", cameraName: "Test camera", cameraStatus: "published", canonicalAnchor: { active: true, current: true, areaCode: "0730600041", areaName: "Synthetic area", areaPath: [], precision: "barangay_centroid", release: "2026-q2" } }} />);
  const tuesday = screen.getByRole("checkbox", { name: "Tuesday" });
  const enabled = screen.getByRole("checkbox", { name: /Make these times available/ });
  const times = screen.getByLabelText("Handoff times");
  await userEvent.click(tuesday);
  await userEvent.click(enabled);
  await userEvent.clear(times);
  await userEvent.type(times, "invalid");
  await userEvent.click(screen.getByRole("button", { name: "Save availability" }));
  await screen.findByText("Enter valid times.");
  expect((tuesday as HTMLInputElement).checked).toBe(true);
  expect((enabled as HTMLInputElement).checked).toBe(false);
  expect((times as HTMLTextAreaElement).value).toBe("invalid");
  await userEvent.clear(times);
  await userEvent.type(times, "17:00");
  await userEvent.click(screen.getByRole("button", { name: "Save availability" }));
  await waitFor(() => expect(submissions).toHaveLength(2));
  expect(submissions[1]).toEqual({ weekdays: ["1", "2"], enabled: null, times: "17:00" });
  await screen.findByText("Availability saved for Synthetic area.");
  await userEvent.click(screen.getByRole("checkbox", { name: "Wednesday" }));
  expect(screen.queryByText("Availability saved for Synthetic area.")).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("Unsaved changes.");
  await userEvent.click(screen.getByRole("button", { name: "Save availability and continue to preview" }));
  await screen.findByText("Availability saved for Synthetic area.");
  expect(intents).toEqual([null, null, "continue"]);
  expect(submissions[2]).toEqual({ weekdays: ["1", "2", "3"], enabled: null, times: "17:00" });
});
