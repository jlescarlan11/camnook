// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
import { ProfileSaveFeedback } from "./profile-save-feedback";

afterEach(cleanup);

it.each(["change", "submit", "pin adjustment"])("clears the previous save acknowledgement on %s without losing the form", (event) => {
  window.history.replaceState(null, "", "/account/profile?saved=1&source=test#renter-details");
  const content = <ProfileSaveFeedback><form onSubmit={e => e.preventDefault()}>
    <label>Name<input defaultValue="Saved renter" /></label>
    <button type="button">Adjust map pin</button>
  </form></ProfileSaveFeedback>;
  const view = render(content);
  expect(screen.getByRole("status").textContent).toContain("were saved");
  const input = screen.getByLabelText("Name") as HTMLInputElement;
  if (event === "change") fireEvent.change(input, { target: { value: "Unsaved renter" } });
  else if (event === "submit") fireEvent.submit(input.form!);
  else fireEvent.click(screen.getByRole("button", { name: "Adjust map pin" }));

  expect(window.location.search).toBe("?source=test");
  expect(window.location.hash).toBe("#renter-details");
  // Next's native-history integration supplies the updated search params.
  view.rerender(<ProfileSaveFeedback>{content.props.children}</ProfileSaveFeedback>);
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByLabelText("Name")).toBe(input);
  expect(input.value).toBe(event === "change" ? "Unsaved renter" : "Saved renter");

  window.history.replaceState(null, "", "/account/profile?saved=1#renter-details");
  view.rerender(<ProfileSaveFeedback>{content.props.children}</ProfileSaveFeedback>);
  expect(screen.getByRole("status").textContent).toContain("were saved");
});
