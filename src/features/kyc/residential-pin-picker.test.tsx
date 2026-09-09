/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({
  default: () => function MapStub({ onDraftChange }: {
    onDraftChange: (value: {
      accuracyMeters: null;
      label: string;
      latitude: number;
      longitude: number;
      source: "map_pin";
    }) => void;
  }) {
    return (
      <button
        onClick={() => onDraftChange({
          accuracyMeters: null,
          label: "Synthetic map selection",
          latitude: 10.3157,
          longitude: 123.8854,
          source: "map_pin",
        })}
        type="button"
      >Choose synthetic point</button>
    );
  },
}));

import { ResidentialPinPicker } from "./residential-pin-picker";

afterEach(cleanup);

function hidden(container: HTMLElement, name: string) {
  return container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
}

describe("ResidentialPinPicker", () => {
  it("keeps an unconfirmed draft client-only when the renter cancels", () => {
    const { container } = render(
      <ResidentialPinPicker addressChanged={false} initialPin={null} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add map pin" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose synthetic point" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(hidden(container, "pinOperation")?.value).toBe("keep");
    expect(hidden(container, "pinLatitude")?.value).toBe("");
    expect(screen.getByText("No residential pin selected.")).toBeTruthy();
  });

  it("submits only a confirmed synthetic point with explicit set semantics", () => {
    const { container } = render(
      <ResidentialPinPicker addressChanged={false} initialPin={null} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add map pin" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose synthetic point" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm this pin" }));

    expect(hidden(container, "pinOperation")?.value).toBe("set");
    expect(hidden(container, "pinLatitude")?.value).toBe("10.3157");
    expect(hidden(container, "pinLongitude")?.value).toBe("123.8854");
    expect(hidden(container, "pinSource")?.value).toBe("map_pin");
  });

  it("reloads and explicitly removes a saved pin", () => {
    const { container } = render(
      <ResidentialPinPicker
        addressChanged
        initialPin={{
          accuracyMeters: 12,
          confirmedAt: "2026-09-09T00:00:00Z",
          latitude: 10.31,
          longitude: 123.89,
          source: "device_gps",
        }}
      />,
    );

    expect(screen.getByText(/Reconfirm or remove/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove map pin" }));

    expect(hidden(container, "pinOperation")?.value).toBe("remove");
    expect(hidden(container, "pinLatitude")?.value).toBe("");
    expect(screen.getByText("No residential pin selected.")).toBeTruthy();
  });
});
