/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { signContract } = vi.hoisted(() => ({ signContract: vi.fn() }));

vi.mock("../actions", () => ({ signContract }));

import { SignContractControl } from "./sign-contract-control";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each([
  [
    "booking reference",
    { bookingId: "Refresh this booking before signing." },
    "Refresh this booking before signing.",
  ],
  [
    "contract version",
    { contractVersionId: "Refresh before signing this contract." },
    "Refresh before signing this contract.",
  ],
])("keeps a rejected hidden %s actionable", async (_label, fieldErrors, message) => {
  signContract.mockResolvedValue({
    error: "invalid_input",
    fieldErrors,
    status: "error",
  });
  render(
    <SignContractControl
      bookingId="22222222-2222-4222-8222-222222222222"
      canSign
      contractVersionId="11111111-1111-4111-8111-111111111111"
    />,
  );

  fireEvent.submit(screen.getByRole("button", { name: "Sign agreement" }).closest("form")!);
  await waitFor(() => expect(signContract).toHaveBeenCalledTimes(1));

  expect(await screen.findByText(message)).toBeTruthy();
  expect(
    screen.queryByText("Review the required consent and refresh if this contract version changed."),
  ).toBeNull();
});
