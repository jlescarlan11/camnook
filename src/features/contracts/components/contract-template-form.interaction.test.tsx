/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { publishContractTemplate } = vi.hoisted(() => ({
  publishContractTemplate: vi.fn(),
}));
vi.mock("../template-actions", () => ({ publishContractTemplate }));

import { ContractTemplateForm } from "./contract-template-form";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("identifies contract-template controls after server validation rejects publishing", async () => {
  publishContractTemplate.mockResolvedValue({
    error: "invalid_input",
    fieldErrors: {
      approval: "Confirm that you reviewed and approve this exact template.",
      terms: "Complete every required term using 10–4,000 characters each.",
      version: "Use 1–80 letters, numbers, periods, underscores, or hyphens.",
    },
    status: "error",
  });
  render(<ContractTemplateForm configuration={{ active: null }} />);

  const controls = [
    [screen.getByLabelText("Template version"), "Use 1–80 letters, numbers, periods, underscores, or hyphens."],
    [screen.getByLabelText("Pickup"), "Complete every required term using 10–4,000 characters each."],
    [screen.getByLabelText("Return"), "Complete every required term using 10–4,000 characters each."],
    [screen.getByLabelText("Cancellation"), "Complete every required term using 10–4,000 characters each."],
    [screen.getByLabelText("Late return"), "Complete every required term using 10–4,000 characters each."],
    [screen.getByLabelText("Damage"), "Complete every required term using 10–4,000 characters each."],
    [screen.getByLabelText("Loss"), "Complete every required term using 10–4,000 characters each."],
    [screen.getByLabelText("Non-transferability"), "Complete every required term using 10–4,000 characters each."],
    [screen.getByRole("checkbox", { name: /I reviewed and approve this exact template/ }), "Confirm that you reviewed and approve this exact template."],
  ] as const;
  fireEvent.submit(
    screen.getByRole("button", { name: "Approve and publish template" }).closest("form")!,
  );
  await waitFor(() => expect(publishContractTemplate).toHaveBeenCalledTimes(1));

  for (const [control, message] of controls) {
    const error = await screen.findByText(message);
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(control.getAttribute("aria-describedby")).toContain(error.getAttribute("id"));
  }
});
