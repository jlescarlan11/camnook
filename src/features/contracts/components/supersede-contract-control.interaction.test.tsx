/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { supersedeContract } = vi.hoisted(() => ({ supersedeContract: vi.fn() }));
vi.mock("../admin-actions", () => ({ supersedeContract }));

import { SupersedeContractControl } from "./supersede-contract-control";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("keeps a rejected hidden booking reference actionable", async () => {
  supersedeContract.mockResolvedValue({
    error: "invalid_input",
    fieldErrors: { bookingId: "Refresh this booking before issuing a replacement." },
    status: "error",
  });
  render(
    <SupersedeContractControl
      bookingId="22222222-2222-4222-8222-222222222222"
      cameras={[{ id: "11111111-1111-4111-8111-111111111111", name: "Test camera" }]}
      currentCameraId="11111111-1111-4111-8111-111111111111"
      pickup="2099-08-15T09:00"
      returnValue="2099-08-16T09:00"
    />,
  );

  fireEvent.submit(screen.getByRole("button", { name: "Issue replacement agreement" }).closest("form")!);
  await waitFor(() => expect(supersedeContract).toHaveBeenCalledTimes(1));

  expect(await screen.findByText("Refresh this booking before issuing a replacement.")).toBeTruthy();
  expect(screen.queryByText("Correct the highlighted replacement details.")).toBeNull();
});
