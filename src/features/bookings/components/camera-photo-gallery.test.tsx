/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it } from "vitest";
import { CameraPhotoGallery } from "./camera-photo-gallery";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);
it("opens the clicked thumbnail, navigates photos, and retains the selected photo after closing", async () => {
  const photos = ["front", "back", "kit"].map((view) => ({ alt: `${view} view`, url: `/${view}.png` }));
  render(<CameraPhotoGallery name="Test camera" photos={photos} />);
  expect(screen.queryByText(/View all/)).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Enlarge photo 2: back view" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByRole("img").getAttribute("alt")).toBe("back view");
  await userEvent.click(within(dialog).getByRole("button", { name: "Next photo" }));
  expect(within(dialog).getByRole("img").getAttribute("alt")).toBe("kit view");
  await userEvent.click(within(dialog).getByRole("button", { name: "Close enlarged photo" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Enlarge photo 3 of Test camera" })).toBeTruthy();
});
it("shows a useful empty photo state", () => {
  render(<CameraPhotoGallery name="Empty" photos={[]} />);
  expect(screen.getByText("No photo available for Empty")).toBeTruthy();
});
