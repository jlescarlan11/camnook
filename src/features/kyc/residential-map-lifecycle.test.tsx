/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const leaflet = vi.hoisted(() => {
  const map = { setView: vi.fn().mockReturnThis(), on: vi.fn(), remove: vi.fn() };
  const marker = { setLatLng: vi.fn().mockReturnThis(), addTo: vi.fn().mockReturnThis(), on: vi.fn(), getLatLng: vi.fn(() => ({ lat: 10.31, lng: 123.89 })) };
  return { map: vi.fn(() => map), marker: vi.fn(() => marker), tileLayer: vi.fn(() => ({ addTo: vi.fn() })), divIcon: vi.fn(), view: map, pin: marker };
});
vi.mock("leaflet", () => leaflet);
import { ResidentialMap } from "./residential-map";

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it.each(["click", "dragend"])("rejects an out-of-bounds map %s without changing the selected pin or fetching a label", async (event) => {
  const first = { accuracyMeters: null, label: "Public Cebu fixture", latitude: 10.31, longitude: 123.89, source: "map_pin" as const };
  const onDraftChange = vi.fn();
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ label: "Outside bounds" })));
  vi.stubGlobal("fetch", request);
  render(<ResidentialMap initialPin={first} mapKey="test-key" onDraftChange={onDraftChange} />);
  await waitFor(() => expect(leaflet.map).toHaveBeenCalledOnce());
  if (event === "click") {
    const click = leaflet.view.on.mock.calls.find(([name]) => name === "click")![1];
    act(() => click({ latlng: { lat: 35.68, lng: 139.69 } }));
  } else {
    leaflet.pin.getLatLng.mockReturnValueOnce({ lat: 35.68, lng: 139.69 });
    const drag = leaflet.pin.on.mock.calls.find(([name]) => name === "dragend")![1];
    act(() => drag());
  }
  expect(onDraftChange).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  expect(leaflet.pin.setLatLng).toHaveBeenLastCalledWith([10.31, 123.89]);
  expect(screen.getByText("Choose a pin within the Philippines.")).toBeTruthy();
});

it("keeps the latest pin label when reverse lookups finish out of order", async () => {
  const finishes: Array<(response: Response) => void> = [];
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => finishes.push(resolve))));
  render(<ResidentialMap initialPin={null} mapKey="test-key" onDraftChange={vi.fn()} />);
  await waitFor(() => expect(leaflet.map).toHaveBeenCalledOnce());
  const click = leaflet.view.on.mock.calls.find(([name]) => name === "click")![1];
  act(() => click({ latlng: { lat: 10.31, lng: 123.89 } }));
  act(() => click({ latlng: { lat: 10.32, lng: 123.90 } }));
  await act(async () => finishes[1](new Response(JSON.stringify({ label: "Latest public fixture" }))));
  await act(async () => finishes[0](new Response(JSON.stringify({ label: "Old public fixture" }))));
  expect(screen.getByText("Selected near Latest public fixture")).toBeTruthy();
  expect(screen.queryByText("Selected near Old public fixture")).toBeNull();
});

it("restores the latest valid map selection after a rejected drag", async () => {
  const onDraftChange = vi.fn();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ label: null }))));
  render(<ResidentialMap initialPin={null} mapKey="test-key" onDraftChange={onDraftChange} />);
  await waitFor(() => expect(leaflet.map).toHaveBeenCalledOnce());
  const click = leaflet.view.on.mock.calls.find(([name]) => name === "click")![1];
  await act(async () => click({ latlng: { lat: 10.32, lng: 123.90 } }));
  leaflet.pin.getLatLng.mockReturnValueOnce({ lat: 35.68, lng: 139.69 });
  const drag = leaflet.pin.on.mock.calls.find(([name]) => name === "dragend")![1];
  act(() => drag());
  expect(leaflet.pin.setLatLng).toHaveBeenLastCalledWith([10.32, 123.90]);
  expect(onDraftChange).toHaveBeenCalledOnce();
  expect((screen.getByLabelText("Latitude") as HTMLInputElement).value).toBe("10.32000");
});

it("moves the marker and view without rebuilding the map or tiles", async () => {
  const first = { accuracyMeters: null, label: "Home", latitude: 10.31, longitude: 123.89, source: "map_pin" as const };
  const onDraftChange = vi.fn();
  const view = render(<ResidentialMap initialPin={first} mapKey="test-key" onDraftChange={onDraftChange} />);
  await waitFor(() => expect(leaflet.map).toHaveBeenCalledOnce());
  view.rerender(<ResidentialMap initialPin={{ ...first, latitude: 10.32 }} mapKey="test-key" onDraftChange={onDraftChange} />);
  expect(leaflet.pin.setLatLng).toHaveBeenCalledWith([10.32, 123.89]);
  expect(leaflet.view.setView).toHaveBeenLastCalledWith([10.32, 123.89], 17);
  expect(leaflet.map).toHaveBeenCalledOnce();
  expect(leaflet.tileLayer).toHaveBeenCalledOnce();
  expect(leaflet.view.remove).not.toHaveBeenCalled();
  expect((screen.getByLabelText("Latitude") as HTMLInputElement).value).toBe("10.32");
  expect(screen.getByRole("button", { name: "Use my location" }).parentElement?.contains(screen.getByRole("application"))).toBe(true);
  fireEvent.click(screen.getByText("Enter coordinates instead"));
  expect(screen.getByLabelText("Latitude")).toBeTruthy();
  view.unmount();
  expect(leaflet.view.remove).toHaveBeenCalledOnce();
});
