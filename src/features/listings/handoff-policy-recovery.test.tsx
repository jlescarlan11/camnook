/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const { save } = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("./handoff-actions", () => ({ saveCameraHandoffPolicy: save }));
vi.mock("@/features/locations/psgc-area-selector", () => ({
  PsgcAreaSelector: ({ errorId, invalid }: { errorId?: string; invalid?: boolean }) => (
    <fieldset aria-describedby={errorId} aria-invalid={invalid ? true : undefined}>
      <legend>Philippine address</legend>
    </fieldset>
  ),
}));
import { HandoffPolicyForm } from "./handoff-policy-form";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it.each(["validation", "transport"])("preserves weekdays, enabled state, and time edits after a %s failure", async (failure) => {
  const intents: (FormDataEntryValue | null)[] = [];
  const submissions: { weekdays: FormDataEntryValue[]; enabled: FormDataEntryValue | null; times: FormDataEntryValue | null }[] = [];
  save.mockImplementation(async (_state, data: FormData) => {
    intents.push(data.get("intent"));
    submissions.push({ weekdays: data.getAll("weekdays"), enabled: data.get("enabled"), times: data.get("approvedTimes") });
    if (submissions.length === 1 && failure === "transport") throw new Error("Synthetic connection failure");
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
  await screen.findByText(failure === "transport"
    ? "The saved policy outcome could not be confirmed. Reload before retrying."
    : "Enter valid times.");
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

it("identifies weekday choices and retains handoff-time guidance after server validation", async () => {
  save.mockResolvedValue({
    error: "invalid_input",
    fieldErrors: {
      approvedTimes: "Enter valid times.",
      weekdays: "Choose at least one handoff day.",
    },
    status: "error",
  });
  render(<HandoffPolicyForm policy={{ allowedWeekdays: [1], approvedTimes: ["09:00"], enabled: true, timezone: "Asia/Manila", version: 2, cityLabel: "Synthetic area", cameraId: "11111111-1111-4111-8111-111111111111", cameraName: "Test camera", cameraStatus: "published", canonicalAnchor: { active: true, current: true, areaCode: "0730600041", areaName: "Synthetic area", areaPath: [], precision: "barangay_centroid", release: "2026-q2" } }} />);

  const times = screen.getByLabelText("Handoff times");
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day) => screen.getByRole("checkbox", { name: day }));
  fireEvent.submit(screen.getByRole("button", { name: "Save availability" }).closest("form")!);
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));

  const weekdayError = await screen.findByText("Choose at least one handoff day.");
  expect(times.getAttribute("aria-describedby")).toContain("approved-times-help");
  expect(times.getAttribute("aria-describedby")).toContain("approved-times-error");
  for (const weekday of weekdays) {
    expect(weekday.getAttribute("aria-invalid")).toBe("true");
    expect(weekday.getAttribute("aria-describedby")).toContain(
      weekdayError.getAttribute("id"),
    );
  }
});

it("identifies the Philippine address group after server validation rejects it", async () => {
  save.mockResolvedValue({
    error: "invalid_input",
    fieldErrors: { city: "Choose a current barangay for this camera." },
    status: "error",
  });
  render(<HandoffPolicyForm policy={{ allowedWeekdays: [1], approvedTimes: ["09:00"], enabled: true, timezone: "Asia/Manila", version: 2, cityLabel: "Synthetic area", cameraId: "11111111-1111-4111-8111-111111111111", cameraName: "Test camera", cameraStatus: "published", canonicalAnchor: { active: true, current: true, areaCode: "0730600041", areaName: "Synthetic area", areaPath: [], precision: "barangay_centroid", release: "2026-q2" } }} />);

  const area = screen.getByRole("group", { name: "Philippine address" });
  fireEvent.submit(screen.getByRole("button", { name: "Save availability" }).closest("form")!);
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));

  const error = await screen.findByText("Choose a current barangay for this camera.");
  expect(area.getAttribute("aria-invalid")).toBe("true");
  expect(area.getAttribute("aria-describedby")).toContain(error.getAttribute("id"));
});

it("keeps a stale hidden camera reference actionable", async () => {
  save.mockResolvedValue({
    error: "invalid_input",
    fieldErrors: { camera: "Reload this camera before saving." },
    status: "error",
  });
  render(<HandoffPolicyForm policy={{ allowedWeekdays: [1], approvedTimes: ["09:00"], enabled: true, timezone: "Asia/Manila", version: 2, cityLabel: "Synthetic area", cameraId: "11111111-1111-4111-8111-111111111111", cameraName: "Test camera", cameraStatus: "published", canonicalAnchor: { active: true, current: true, areaCode: "0730600041", areaName: "Synthetic area", areaPath: [], precision: "barangay_centroid", release: "2026-q2" } }} />);

  fireEvent.submit(screen.getByRole("button", { name: "Save availability" }).closest("form")!);
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));

  expect(await screen.findByText("Reload this camera before saving.")).toBeTruthy();
  expect(screen.queryByText("Correct the highlighted fields and try again.")).toBeNull();
});
