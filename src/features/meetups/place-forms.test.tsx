// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("./place-actions", () => ({
  saveMeetupPlace: vi.fn(),
  archiveMeetupPlace: vi.fn(),
  assignCameraMeetupPlaces: vi.fn(),
  searchMeetupPlaces: vi.fn(),
}));
import { saveMeetupPlace, searchMeetupPlaces } from "./place-actions";
import { MeetupPlaceForm } from "./place-forms";
afterEach(cleanup);
it("keeps the same creation reference on failure and resets only after success", async () => {
  vi.mocked(saveMeetupPlace)
    .mockResolvedValueOnce({ status: "error", message: "Retry this save." })
    .mockResolvedValueOnce({ status: "success", message: "Meetup place saved." });
  const creationId = "55555555-5555-4555-8555-555555555555";
  const { container } = render(<MeetupPlaceForm creationId={creationId} />);
  await userEvent.type(screen.getByLabelText("Place name"), "Public entrance");
  await userEvent.type(screen.getByLabelText("Street address"), "Public road, Cebu City");
  await userEvent.type(screen.getByLabelText("City"), "Cebu City");
  await userEvent.type(screen.getByLabelText("Latitude"), "10.315712");
  await userEvent.type(screen.getByLabelText("Longitude"), "123.885423");
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Save meetup place" }));
  await screen.findByText("Retry this save.");
  expect((screen.getByLabelText("Place name") as HTMLInputElement).value).toBe("Public entrance");
  expect(saveMeetupPlace).toHaveBeenCalledTimes(1);
  expect(vi.mocked(saveMeetupPlace).mock.calls[0][1].get("creationId")).toBe(creationId);
  await userEvent.click(screen.getByRole("button", { name: "Save meetup place" }));
  await screen.findByText("Meetup place saved.");
  expect(vi.mocked(saveMeetupPlace).mock.calls[1][1].get("creationId")).toBe(creationId);
  await waitFor(() => expect((screen.getByLabelText("Place name") as HTMLInputElement).value).toBe(""));
  expect((container.querySelector('[name="creationId"]') as HTMLInputElement).value).not.toBe(creationId);
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole("button", { name: "Save meetup place" }) as HTMLButtonElement).disabled).toBe(true);
});
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
