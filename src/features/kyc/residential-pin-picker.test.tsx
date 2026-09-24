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
  it("keeps an unconfirmed draft client-only when the renter discards changes", () => {
    const { container } = render(
      <ResidentialPinPicker addressChanged={false} initialPin={null} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose synthetic point" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(hidden(container, "pinOperation")?.value).toBe("keep");
    expect(hidden(container, "savedPinPresent")?.value).toBe("0");
    expect(hidden(container, "pinLatitude")?.value).toBe("");
    expect(screen.getByText("No residential pin selected.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose synthetic point" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Confirm this pin" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("submits only a confirmed synthetic point with explicit set semantics", () => {
    const { container } = render(
      <ResidentialPinPicker addressChanged={false} initialPin={null} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose synthetic point" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm this pin" }));
    expect(screen.getByRole("button", { name: "Choose synthetic point" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm this pin" })).toBeTruthy();

    expect(hidden(container, "pinOperation")?.value).toBe("set");
    expect(hidden(container, "pinLatitude")?.value).toBe("10.3157");
    expect(hidden(container, "pinLongitude")?.value).toBe("123.8854");
    expect(hidden(container, "pinSource")?.value).toBe("map_pin");
  });

  it("requires a changed address to reconfirm its saved pin", () => {
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

    expect(screen.getByText(/Reconfirm the saved pin/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove map pin" })).toBeNull();
    expect(hidden(container, "savedPinPresent")?.value).toBe("1");
    expect(hidden(container, "pinOperation")?.value).toBe("keep");
    expect(screen.getByRole("button", { name: "Choose synthetic point" })).toBeTruthy();
  });
});

it("retains a confirmed pin after leaving the checkout", () => {
  sessionStorage.clear();
  const first = render(<ResidentialPinPicker addressChanged={false} initialPin={null} draftKey="pin-draft" />);
  fireEvent.click(screen.getByRole("button", { name: "Choose synthetic point" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm this pin" }));
  first.unmount();
  const second = render(<ResidentialPinPicker addressChanged={false} initialPin={null} draftKey="pin-draft" />);
  expect(hidden(second.container, "pinOperation")?.value).toBe("set");
  expect(hidden(second.container, "pinLatitude")?.value).toBe("10.3157");
  expect(hidden(second.container, "pinLongitude")?.value).toBe("123.8854");
  sessionStorage.clear();
});
