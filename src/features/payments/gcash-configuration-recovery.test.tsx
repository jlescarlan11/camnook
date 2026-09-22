// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./admin-actions", () => ({ configureGcashRecipient: vi.fn() }));
import { configureGcashRecipient } from "./admin-actions";
import { GcashConfigurationForm } from "./gcash-configuration-form";

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("retains the intended recipient after an unconfirmed save so retry cannot restore old details", async () => {
  vi.mocked(configureGcashRecipient).mockResolvedValueOnce({ status: "error", error: "indeterminate" }).mockResolvedValue({ status: "success", version: 2 });
  const configuration = { enabled: true, recipient_name: "Synthetic Old Recipient", recipient_account: "09170000001", version: 1 };
  const view = render(<GcashConfigurationForm configuration={configuration} />);
  const user = userEvent.setup();
  const name = screen.getByLabelText("Recipient name") as HTMLInputElement;
  const account = screen.getByLabelText("GCash number") as HTMLInputElement;
  await user.clear(name);
  await user.type(name, "Synthetic Intended Recipient");
  await user.clear(account);
  await user.type(account, "09170000002");
  await user.click(screen.getByRole("button", { name: "Save GCash details" }));
  await screen.findByText("The saved outcome could not be confirmed. Reload before retrying.");
  view.rerender(<GcashConfigurationForm configuration={{ ...configuration }} />);
  expect(name.value).toBe("Synthetic Intended Recipient");
  expect(account.value).toBe("09170000002");
  await user.click(screen.getByRole("button", { name: "Save GCash details" }));
  await screen.findByText("GCash details saved.");
  expect(Object.fromEntries(vi.mocked(configureGcashRecipient).mock.calls[1][1])).toEqual(Object.fromEntries(vi.mocked(configureGcashRecipient).mock.calls[0][1]));
});
