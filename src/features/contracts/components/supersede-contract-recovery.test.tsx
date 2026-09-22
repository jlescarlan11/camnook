// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../admin-actions", () => ({ supersedeContract: vi.fn() }));
import { supersedeContract } from "../admin-actions";
import { SupersedeContractControl } from "./supersede-contract-control";

afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("retains the intended camera and schedule when replacement cannot be confirmed", async () => {
  vi.mocked(supersedeContract).mockResolvedValueOnce({ status: "indeterminate", error: "unknown" }).mockResolvedValue({ status: "success" });
  const props = {
    bookingId: "84000000-0000-4000-8000-000000000001",
    cameras: [{ id: "84000000-0000-4000-8000-000000000002", name: "Synthetic Camera A" }, { id: "84000000-0000-4000-8000-000000000003", name: "Synthetic Camera B" }],
    currentCameraId: "84000000-0000-4000-8000-000000000002", pickup: "2026-09-23T10:00", returnValue: "2026-09-24T10:00",
  };
  const view = render(<SupersedeContractControl {...props} />);
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Camera"), props.cameras[1].id);
  fireEvent.change(screen.getByLabelText("Pickup (Asia/Manila)"), { target: { value: "2026-09-25T11:00" } });
  fireEvent.change(screen.getByLabelText("Return (Asia/Manila)"), { target: { value: "2026-09-27T11:00" } });
  await user.click(screen.getByRole("button", { name: "Issue replacement agreement" }));
  await screen.findByText("The result could not be confirmed. Refresh before retrying.");
  view.rerender(<SupersedeContractControl {...props} />);
  expect((screen.getByLabelText("Camera") as HTMLSelectElement).value).toBe(props.cameras[1].id);
  expect((screen.getByLabelText("Pickup (Asia/Manila)") as HTMLInputElement).value).toBe("2026-09-25T11:00");
  expect((screen.getByLabelText("Return (Asia/Manila)") as HTMLInputElement).value).toBe("2026-09-27T11:00");
  await user.click(screen.getByRole("button", { name: "Issue replacement agreement" }));
  await screen.findByText("Replacement agreement issued. Reloading persisted history…");
  expect(Object.fromEntries(vi.mocked(supersedeContract).mock.calls[1][1])).toEqual(Object.fromEntries(vi.mocked(supersedeContract).mock.calls[0][1]));
});
