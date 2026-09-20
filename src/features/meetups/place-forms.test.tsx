// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("./place-actions", () => ({
  saveMeetupPlace: vi.fn(),
  archiveMeetupPlace: vi.fn(),
  assignCameraMeetupPlaces: vi.fn(),
  searchMeetupPlaces: vi.fn(),
}));
import { searchMeetupPlaces } from "./place-actions";
import { MeetupPlaceForm } from "./place-forms";
afterEach(cleanup);
it("normalizes live search coordinates to the precision accepted by the form", async () => {
  vi.mocked(searchMeetupPlaces).mockResolvedValue({
    places: [
      {
        address: "Public mall entrance, Cebu",
        city: "Cebu City",
        latitude: 10.318116123,
        longitude: 123.9048331,
      },
    ],
  });
  render(<MeetupPlaceForm />);
  await userEvent.type(
    screen.getByLabelText("Find a public place"),
    "Ayala Center Cebu",
  );
  await userEvent.click(screen.getByRole("button", { name: "Search places" }));
  await userEvent.click(
    await screen.findByRole("button", { name: "Public mall entrance, Cebu" }),
  );
  const longitude = screen.getByLabelText("Longitude") as HTMLInputElement;
  const latitude = screen.getByLabelText("Latitude") as HTMLInputElement;
  expect(longitude.value).toBe("123.904833");
  expect(latitude.value).toBe("10.318116");
  expect(longitude.validity.stepMismatch).toBe(false);
  expect(latitude.validity.stepMismatch).toBe(false);
});
