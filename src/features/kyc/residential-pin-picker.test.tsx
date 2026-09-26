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

it("requires confirmation again after another address edit in the same form", () => {
  const view = render(<ResidentialPinPicker addressChanged addressEditRevision={1} initialPin={null}/>);
  fireEvent.click(screen.getByRole("button",{name:"Choose synthetic point"}));
  fireEvent.click(screen.getByRole("button",{name:"Confirm this pin"}));
  expect(hidden(view.container,"pinOperation")?.value).toBe("set");
  view.rerender(<ResidentialPinPicker addressChanged addressEditRevision={2} initialPin={null}/>);
  expect(hidden(view.container,"pinOperation")?.value).not.toBe("set");
  expect(hidden(view.container,"pinConfirmationRequired")?.value).toBe("1");
  fireEvent.click(screen.getByRole("button",{name:"Adjust map pin"}));
  fireEvent.click(screen.getByRole("button",{name:"Confirm this pin"}));
  expect(hidden(view.container,"pinOperation")?.value).toBe("set");
});
it("invalidates confirmation on a new manual selection even at the same coordinates",()=>{
  const view=render(<ResidentialPinPicker addressChanged={false} initialPin={null}/>);
  fireEvent.click(screen.getByRole("button",{name:"Choose synthetic point"}));
  fireEvent.click(screen.getByRole("button",{name:"Confirm this pin"}));
  fireEvent.click(screen.getByRole("button",{name:"Adjust map pin"}));
  fireEvent.click(screen.getByRole("button",{name:"Choose synthetic point"}));
  expect(hidden(view.container,"pinConfirmationRequired")?.value).toBe("1");
});
it("stages suggested GPS coordinates without submitting them until confirmation", () => {
  const pin = {latitude:10.33,longitude:123.9,accuracyMeters:20,label:"Device location",source:"device_gps" as const};
  const view = render(<ResidentialPinPicker addressChanged addressEditRevision={1} initialPin={null} suggestedPin={{requestId:1,pin}}/>);
  expect(hidden(view.container,"pinLatitude")?.value).toBe("");
  fireEvent.click(screen.getByRole("button",{name:"Confirm this pin"}));
  expect(hidden(view.container,"pinLatitude")?.value).toBe("10.33");
  expect(hidden(view.container,"pinAccuracyMeters")?.value).toBe("20");
  view.rerender(<ResidentialPinPicker addressChanged addressEditRevision={1} initialPin={null} suggestedPin={{requestId:2,pin}}/>);
  expect(hidden(view.container,"pinLatitude")?.value).toBe("");
});

function hidden(container: HTMLElement, name: string) {
  return container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
}

it("keeps a restored unconfirmed GPS draft visible over a saved pin", () => {
  sessionStorage.clear();
  const initialPin = { latitude: 10.31, longitude: 123.89, accuracyMeters: 12,
    confirmedAt: "2026-09-09T00:00:00Z", source: "device_gps" as const };
  const pin = { latitude: 10.33, longitude: 123.9, accuracyMeters: 20,
    label: "Device location", source: "device_gps" as const };
  const first = render(<ResidentialPinPicker addressChanged initialPin={initialPin}
    draftKey="staged-saved-pin" suggestedPin={{ requestId: 1, pin }} />);
  first.unmount();
  const restored = render(<ResidentialPinPicker addressChanged initialPin={initialPin}
    draftKey="staged-saved-pin" />);
  expect(hidden(restored.container, "pinLatitude")?.value).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Confirm this pin" }));
  expect(hidden(restored.container, "pinLatitude")?.value).toBe("10.33");
  sessionStorage.clear();
});

describe("ResidentialPinPicker", () => {
  it("describes a server validation error from the labelled pin control region", () => {
    render(
      <ResidentialPinPicker addressChanged={false} error="Confirm a current residential pin." initialPin={null} />,
    );

    const error = screen.getByText("Confirm a current residential pin.");
    const pin = screen.getByRole("region", { name: /Residential map pin/ });
    expect(pin.getAttribute("aria-describedby")).toContain(error.getAttribute("id"));
  });

  it("keeps an unconfirmed draft client-only when the renter discards changes", () => {
    const { container } = render(
      <ResidentialPinPicker addressChanged={false} initialPin={null} />,
    );

    expect(screen.queryByRole("button", { name: "Add map pin" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Choose synthetic point" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(hidden(container, "pinOperation")?.value).toBe("keep");
    expect(hidden(container, "savedPinPresent")?.value).toBe("0");
    expect(hidden(container, "pinLatitude")?.value).toBe("");
    expect(screen.getByText("No residential pin selected.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add map pin" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add map pin" }));
    expect(screen.getByRole("button", { name: "Choose synthetic point" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Confirm this pin" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("submits only a confirmed synthetic point with explicit set semantics", () => {
    const { container } = render(
      <ResidentialPinPicker addressChanged={false} initialPin={null} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose synthetic point" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm this pin" }));
    expect(screen.getByRole("button", { name: "Adjust map pin" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Choose synthetic point" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirm this pin" })).toBeNull();

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
    expect(screen.getByRole("button", { name: "Adjust map pin" })).toBeTruthy();
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
