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
import { assignCameraMeetupPlaces, saveMeetupPlace, searchMeetupPlaces } from "./place-actions";
import { CameraMeetupPlacesForm, MeetupPlaceForm } from "./place-forms";
import { testMeetupPlace } from "./place-fixture.test-helper";
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it.each([false, true])("Enter searches without saving a place (save-ready: %s)", async (ready) => {
  vi.mocked(searchMeetupPlaces).mockResolvedValue({ places: [{ address: "Search result entrance", city: "Cebu City", latitude: 10.318116, longitude: 123.904833 }] });
  vi.mocked(saveMeetupPlace).mockResolvedValue({ status: "success", message: "Meetup place saved." });
  render(<MeetupPlaceForm place={ready ? { ...testMeetupPlace, source: "manual_pin" } : undefined} />);
  if (ready) await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.type(screen.getByLabelText("Find a public place"), "Ayala Center Cebu{Enter}");
  expect(searchMeetupPlaces).toHaveBeenCalledExactlyOnceWith("Ayala Center Cebu");
  expect(saveMeetupPlace).not.toHaveBeenCalled();
  expect(await screen.findByRole("button", { name: "Search result entrance" })).toBeTruthy();
  expect((screen.getByLabelText("Place name") as HTMLInputElement).value).toBe(ready ? testMeetupPlace.name : "");
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(ready);
});

it("does not send duplicate searches when Enter repeats during a pending search", async () => {
  let finish!: (result: Awaited<ReturnType<typeof searchMeetupPlaces>>) => void;
  vi.mocked(searchMeetupPlaces).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  render(<MeetupPlaceForm />);
  await userEvent.type(screen.getByLabelText("Find a public place"), "Ayala{Enter}{Enter}");
  expect(searchMeetupPlaces).toHaveBeenCalledTimes(1);
  expect((screen.getByRole("button", { name: "Searching…" }) as HTMLButtonElement).disabled).toBe(true);
  finish({ places: [] });
  await screen.findByText("No places found. Try another name or position the pin manually.");
  expect(saveMeetupPlace).not.toHaveBeenCalled();
});

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

it.each(["success", "error"] as const)("keeps meetup selections and subsequent submissions consistent after %s", async (status) => {
  vi.mocked(assignCameraMeetupPlaces).mockResolvedValue({
    status,
    message: status === "success" ? "Meetup choices saved." : "Could not save. Try again.",
  });
  const place = {
    id: "11111111-1111-4111-8111-111111111111",
    version: 1,
    name: "Public meetup",
    address: "Public entrance, Cebu City",
    city: "Cebu City",
    latitude: 10.33,
    longitude: 123.9,
    arrival_instructions: "",
    attribution: null,
  };
  render(<CameraMeetupPlacesForm cameraId="22222222-2222-4222-8222-222222222222" places={[place]} selected={[]} />);
  const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
  const submit = screen.getByRole("button", { name: "Save meetup choices" });
  await userEvent.click(checkbox);
  await userEvent.click(submit);
  await screen.findByText(status === "success" ? "Meetup choices saved." : "Could not save. Try again.");
  expect(checkbox.checked).toBe(true);
  expect((vi.mocked(assignCameraMeetupPlaces).mock.calls[0][1] as FormData).getAll("places")).toEqual([place.id]);

  await userEvent.click(checkbox);
  await userEvent.click(submit);
  expect(checkbox.checked).toBe(false);
  expect((vi.mocked(assignCameraMeetupPlaces).mock.calls[1][1] as FormData).getAll("places")).toEqual([]);
  expect(screen.getByText("Assign a place to allow new rental requests.")).toBeTruthy();
});
