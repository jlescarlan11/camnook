import { expect, it } from "vitest";
import { formatCameraAccessories, parseCameraAccessories } from "./camera-accessories";

it("round-trips stored quantities and names without splitting commas", () => {
  const items = [{ name: "Battery", quantity: 2 }, { name: "Cable, USB-C", quantity: 1 }, { name: "2 x Lens adapter", quantity: 1 }];
  expect(parseCameraAccessories(formatCameraAccessories(items))).toEqual(items);
});

it("accepts single items and explicit quantities with either multiplication marker", () => {
  expect(parseCameraAccessories("Charger\r\n2 x Battery\n3 × Lens cap\n\n32 GB SD card")).toEqual([
    { name: "Charger", quantity: 1 }, { name: "Battery", quantity: 2 }, { name: "Lens cap", quantity: 3 }, { name: "32 GB SD card", quantity: 1 },
  ]);
});

it.each(["0 × Battery", "-1 x Battery", "1.5 × Battery", "2 ×", "2147483648 x Battery", "Battery\nbattery"])("rejects invalid or duplicated item input: %s", (value) => {
  expect(parseCameraAccessories(value)).toBeNull();
});
