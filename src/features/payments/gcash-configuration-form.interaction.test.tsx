/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { configureGcashRecipient } = vi.hoisted(() => ({
  configureGcashRecipient: vi.fn(),
}));
vi.mock("./admin-actions", () => ({ configureGcashRecipient }));

import { GcashConfigurationForm } from "./gcash-configuration-form";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("identifies recipient controls after server validation rejects GCash details", async () => {
  configureGcashRecipient.mockResolvedValue({
    error: "invalid",
    fieldErrors: {
      recipientAccount: "Enter a valid Philippine mobile number.",
      recipientName: "Enter the recipient name.",
    },
    status: "error",
  });
  render(
    <GcashConfigurationForm
      configuration={{
        enabled: false,
        recipient_account: null,
        recipient_name: null,
        version: 0,
      }}
    />,
  );

  const recipientName = screen.getByLabelText("Recipient name");
  const recipientAccount = screen.getByRole("textbox", { name: "GCash number" });
  fireEvent.submit(
    screen.getByRole("button", { name: "Save GCash details" }).closest("form")!,
  );
  await waitFor(() => expect(configureGcashRecipient).toHaveBeenCalledTimes(1));

  for (const [control, message] of [
    [recipientName, "Enter the recipient name."],
    [recipientAccount, "Enter a valid Philippine mobile number."],
  ] as const) {
    const error = await screen.findByText(message);
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(control.getAttribute("aria-describedby")).toContain(error.getAttribute("id"));
  }

  expect(recipientAccount.getAttribute("aria-describedby")).toContain(
    screen
      .getByText("Country code +63 is included automatically.")
      .getAttribute("id"),
  );
});
