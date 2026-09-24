/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const { saveMeetupOrigin } = vi.hoisted(() => ({ saveMeetupOrigin: vi.fn() }));

vi.mock("./actions", () => ({
  removeMeetupOrigin: vi.fn(),
  saveMeetupOrigin,
}));
vi.mock("./psgc-area-selector", () => ({
  PsgcAreaSelector: ({ errorId, invalid }: { errorId?: string; invalid?: boolean }) => (
    <fieldset aria-describedby={errorId} aria-invalid={invalid ? true : undefined}>
      <legend>Philippine address</legend>
      <input name="psgcAreaCode" type="hidden" value="0702200001" />
    </fieldset>
  ),
}));

import { MeetupOriginForm } from "./meetup-origin-form";

it("identifies the Philippine address selector after the saved origin is rejected", async () => {
  saveMeetupOrigin.mockResolvedValue({ error: "invalid", status: "error" });
  render(<MeetupOriginForm origin={null} />);

  const area = screen.getByRole("group", { name: "Philippine address" });
  fireEvent.submit(screen.getByRole("button", { name: "Save default address" }).closest("form")!);
  await waitFor(() => expect(saveMeetupOrigin).toHaveBeenCalledTimes(1));

  const error = await screen.findByText("Choose a current barangay.");
  expect(area.getAttribute("aria-invalid")).toBe("true");
  expect(area.getAttribute("aria-describedby")).toContain(error.getAttribute("id"));
});
