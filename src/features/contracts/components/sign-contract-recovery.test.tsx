// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../actions", () => ({ signContract: vi.fn() }));
import { signContract } from "../actions";
import { SignContractControl } from "./sign-contract-control";

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("requires fresh consent when the displayed agreement version changes", async () => {
  vi.mocked(signContract).mockResolvedValue({ status: "success", created: true });
  const bookingId = "84000000-0000-4000-8000-000000000001";
  const originalVersion = "84000000-0000-4000-8000-000000000002";
  const replacementVersion = "84000000-0000-4000-8000-000000000003";
  const user = userEvent.setup();
  const view = render(<SignContractControl bookingId={bookingId} contractVersionId={originalVersion} canSign />);
  await user.click(screen.getByRole("checkbox"));
  view.rerender(<SignContractControl bookingId={bookingId} contractVersionId={originalVersion} canSign />);
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  view.rerender(<SignContractControl bookingId={bookingId} contractVersionId={replacementVersion} canSign />);
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  await user.click(screen.getByRole("button", { name: "Sign agreement" }));
  expect(signContract).not.toHaveBeenCalled();
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Sign agreement" }));
  await screen.findByText("Signature recorded. This booking is now ready for payment.");
  expect(vi.mocked(signContract).mock.calls[0][1].get("contractVersionId")).toBe(replacementVersion);
});
