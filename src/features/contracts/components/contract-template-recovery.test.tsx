// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../template-actions", () => ({ publishContractTemplate: vi.fn() }));
import { publishContractTemplate } from "../template-actions";
import { CONTRACT_TERM_KEYS, type ContractTemplateConfiguration, type ContractTerms } from "../template-types";
import { ContractTemplateForm } from "./contract-template-form";

afterEach(() => { cleanup(); vi.resetAllMocks(); });
const configuration: ContractTemplateConfiguration = { active: {
  id: "84000000-0000-4000-8000-000000000001", version: "synthetic-v1", schema_version: 1,
  content_sha256: "a".repeat(64), activated_at: "2026-09-22T00:00:00Z", approved_at: "2026-09-22T00:00:00Z", created_at: "2026-09-22T00:00:00Z",
  terms: Object.fromEntries(CONTRACT_TERM_KEYS.map((key) => [key, `Synthetic original ${key} terms.`])) as ContractTerms,
} };

it("keeps drafted terms and version after a rejected publication", async () => {
  vi.mocked(publishContractTemplate).mockResolvedValue({ status: "error", error: "version_conflict" });
  const view = render(<ContractTemplateForm configuration={configuration} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Template version"), "synthetic-v2");
  const pickup = screen.getByLabelText("Pickup") as HTMLTextAreaElement;
  await user.clear(pickup);
  await user.type(pickup, "Synthetic revised pickup terms for this test.");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Publish replacement template" }));
  await screen.findByText("That template version already exists. Choose a new version.");
  view.rerender(<ContractTemplateForm configuration={configuration} />);
  expect(pickup.value).toBe("Synthetic revised pickup terms for this test.");
  expect((screen.getByLabelText("Template version") as HTMLInputElement).value).toBe("synthetic-v2");
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
});

it("keeps the draft bound to the template it was based on when active configuration changes", async () => {
  vi.mocked(publishContractTemplate).mockResolvedValue({ status: "success", version: "synthetic-v3" });
  const view = render(<ContractTemplateForm configuration={configuration} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Template version"), "synthetic-v3");
  const pickup = screen.getByLabelText("Pickup") as HTMLTextAreaElement;
  await user.clear(pickup);
  await user.type(pickup, "Synthetic owner draft that must remain available.");
  await user.click(screen.getByRole("checkbox"));
  view.rerender(<ContractTemplateForm configuration={{ active: { ...configuration.active!, id: "84000000-0000-4000-8000-000000000002", version: "synthetic-concurrent-version", terms: { ...configuration.active!.terms, return: "Synthetic concurrent return terms." } } }} />);
  expect(new FormData(pickup.form!).get("expectedActiveId")).toBe(configuration.active!.id);
  expect(pickup.value).toBe("Synthetic owner draft that must remain available.");
  expect((screen.getByRole("button", { name: "Publish replacement template" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText("Return") as HTMLTextAreaElement).value).toBe(configuration.active!.terms.return);
  await user.click(screen.getByRole("button", { name: "Review replacement draft" }));
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  expect(pickup.value).toBe("Synthetic owner draft that must remain available.");
  await user.click(screen.getByRole("button", { name: "Publish replacement template" }));
  expect(publishContractTemplate).not.toHaveBeenCalled();
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Publish replacement template" }));
  await screen.findByText(/Template synthetic-v3 is active/);
  const submitted = vi.mocked(publishContractTemplate).mock.calls[0][1];
  expect(submitted.get("expectedActiveId")).toBe("84000000-0000-4000-8000-000000000002");
  expect(submitted.get("pickup")).toBe("Synthetic owner draft that must remain available.");
  expect(submitted.get("return")).toBe(configuration.active!.terms.return);

});
