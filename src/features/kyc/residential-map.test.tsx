/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResidentialMap } from "./residential-map";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ResidentialMap fallbacks", () => {
  it("removes earlier suggestions when the query changes and the next lookup fails", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ suggestions: [{ label: "Old Cebu result", latitude: 10.31, longitude: 123.89 }] })))
      .mockRejectedValueOnce(new Error("temporary failure")));
    render(<ResidentialMap initialPin={null} mapKey="" onDraftChange={vi.fn()} />);
    const query = screen.getByLabelText("Search a Philippine address");
    await userEvent.type(query, "Cebu");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByRole("button", { name: "Old Cebu result" });
    await userEvent.clear(query);
    await userEvent.type(query, "Mandaue");
    expect(screen.queryByRole("button", { name: "Old Cebu result" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText(/Address search is unavailable/);
    expect(screen.queryByRole("list", { name: "Address search results" })).toBeNull();
  });

  it("ignores a search response that arrives after the user edits its query", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    render(<ResidentialMap initialPin={null} mapKey="" onDraftChange={vi.fn()} />);
    const query = screen.getByLabelText("Search a Philippine address");
    await userEvent.type(query, "Cebu");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.clear(query);
    await act(async () => finish(new Response(JSON.stringify({ suggestions: [{ label: "Late Cebu result", latitude: 10.31, longitude: 123.89 }] }))));
    expect(screen.queryByRole("button", { name: "Late Cebu result" })).toBeNull();
    expect(screen.queryByText("Choose a result below.")).toBeNull();
  });

  it("requests geolocation only after the explicit action and retains accuracy", async () => {
    const onDraftChange = vi.fn();
    const getCurrentPosition = vi.fn((success: PositionCallback) => success({
      coords: {
        accuracy: 8,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        latitude: 10.3157,
        longitude: 123.8854,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: 0,
      toJSON: () => ({}),
    }));
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    render(<ResidentialMap initialPin={null} mapKey="" onDraftChange={onDraftChange} />);
    expect(getCurrentPosition).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({
      accuracyMeters: 8,
      latitude: 10.3157,
      longitude: 123.8854,
      source: "device_gps",
    }));
  });

  it("supports keyboard coordinate placement when tiles are unavailable", () => {
    const onDraftChange = vi.fn();
    render(<ResidentialMap initialPin={null} mapKey="" onDraftChange={onDraftChange} />);

    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "10.32" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "123.90" } });
    fireEvent.click(screen.getByRole("button", { name: "Place pin at coordinates" }));

    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({
      accuracyMeters: null,
      latitude: 10.32,
      longitude: 123.9,
      source: "map_pin",
    }));
    expect(screen.getByText("Coordinates selected. Confirm the pin below.")).toBeTruthy();
  });

  it("places coordinates with Enter without submitting the enclosing profile", async () => {
    const onDraftChange = vi.fn();
    const submit = vi.fn();
    render(<form onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <ResidentialMap initialPin={null} mapKey="" onDraftChange={onDraftChange} />
      <button type="submit">Save profile</button>
    </form>);
    for (const label of ["Latitude", "Longitude"]) {
      await userEvent.click(screen.getByLabelText(label));
      await userEvent.keyboard("{Enter}");
    }
    expect(submit).not.toHaveBeenCalled();
    expect(onDraftChange).toHaveBeenCalledTimes(2);
    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({
      latitude: 10.3157, longitude: 123.8854, source: "map_pin",
    }));
    await userEvent.clear(screen.getByLabelText("Latitude"));
    await userEvent.type(screen.getByLabelText("Latitude"), "99{Enter}");
    expect(screen.getByText("Enter valid Philippine coordinates.")).toBeTruthy();
    expect(onDraftChange).toHaveBeenCalledTimes(2);
    expect(submit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(submit).toHaveBeenCalledOnce();
  });

  it("selects a bounded search suggestion without changing written fields", async () => {
    const onDraftChange = vi.fn();
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      suggestions: [{
        label: "Synthetic public fixture, Cebu City",
        latitude: 10.31,
        longitude: 123.89,
      }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    render(<ResidentialMap initialPin={null} mapKey="" onDraftChange={onDraftChange} />);

    await userEvent.type(screen.getByLabelText("Search a Philippine address"), "Cebu fixture");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(screen.getByRole("button", {
      name: "Synthetic public fixture, Cebu City",
    }));

    expect(request).toHaveBeenCalledWith("/api/kyc/residential-geocode", expect.objectContaining({
      method: "POST",
    }));
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({
      latitude: 10.31,
      longitude: 123.89,
      source: "map_pin",
    }));
  });
});
