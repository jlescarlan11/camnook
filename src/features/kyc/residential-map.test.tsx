/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResidentialMap } from "./residential-map";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ResidentialMap fallbacks", () => {
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
