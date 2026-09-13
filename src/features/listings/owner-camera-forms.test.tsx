/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const { rpc, redirect } = vi.hoisted(() => ({ rpc: vi.fn(), redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: async () => ({ supabase: { schema: () => ({ rpc }) } }) }));
import { BlockDatesForm, CameraDetailsForm, CameraDetailsContinueButton, UnpublishCameraForm } from "./owner-camera-forms";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("retains a rejected blocked range for correction and clears it only after success", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  render(<BlockDatesForm cameraId="11111111-1111-4111-8111-111111111111" />);
  const start = screen.getByLabelText("From") as HTMLInputElement;
  const end = screen.getByLabelText("Through") as HTMLInputElement;
  fireEvent.change(start, { target: { value: "2099-08-24" } });
  fireEvent.change(end, { target: { value: "2099-08-23" } });
  await userEvent.click(screen.getByRole("button", { name: "Block dates" }));
  await screen.findByRole("alert");
  expect(start.value).toBe("2099-08-24");
  expect(end.value).toBe("2099-08-23");
  expect(rpc).not.toHaveBeenCalled();
  fireEvent.change(end, { target: { value: "2099-08-25" } });
  await userEvent.click(screen.getByRole("button", { name: "Block dates" }));
  await screen.findByText("Dates blocked.");
  expect(rpc).toHaveBeenCalledWith("create_manual_block", expect.objectContaining({ p_starts_at: "2099-08-24T00:00:00+08:00", p_ends_at: "2099-08-25T16:00:00.000Z" }));
  expect(start.value).toBe("");
  expect(end.value).toBe("");
});

it("preserves kit quantities through the real save action when only the price changes", async () => {
  rpc.mockResolvedValue({ data: "11111111-1111-4111-8111-111111111111", error: null });
  const accessories = [{ name: "Battery", quantity: 2 }, { name: "Cable, USB-C", quantity: 1 }];
  render(<CameraDetailsForm camera={{ id: "11111111-1111-4111-8111-111111111111", name: "Test camera", description: "Synthetic kit", daily_rate: 450, security_deposit: 1000, accessories }} />);
  const price = screen.getByRole("spinbutton", { name: "Daily price" });
  await userEvent.clear(price);
  await userEvent.type(price, "500");
  await userEvent.click(screen.getByRole("button", { name: "Save camera" }));
  await waitFor(() => expect(rpc).toHaveBeenCalledOnce());
  expect(rpc).toHaveBeenCalledWith("save_camera_draft", { p_input: expect.objectContaining({ daily_rate: 500, accessories }) });
  expect((await screen.findByRole("status")).textContent).toBe("Camera details saved.");
  await userEvent.clear(price);
  await userEvent.type(price, "600");
  expect(screen.getByRole("status").textContent).toBe("Unsaved changes.");
  await userEvent.click(screen.getByRole("button", { name: "Save camera" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Camera details saved."));
  expect(rpc).toHaveBeenLastCalledWith("save_camera_draft", { p_input: expect.objectContaining({ daily_rate: 600, accessories }) });
});

it("retains edits after validation failure and saves them after correcting only the invalid field", async () => {
  rpc.mockResolvedValue({ data: "11111111-1111-4111-8111-111111111111", error: null });
  render(<CameraDetailsForm camera={{ id: "11111111-1111-4111-8111-111111111111", name: "Test camera", description: "Original description", daily_rate: 450, security_deposit: 1000, accessories: [{ name: "Battery", quantity: 2 }] }} />);
  const description = screen.getByRole("textbox", { name: "Description" });
  const included = screen.getByRole("textbox", { name: /What’s included/ });
  await userEvent.clear(description);
  await userEvent.type(description, "Keep this edited description");
  await userEvent.clear(included);
  await userEvent.type(included, "0 × Battery");
  await userEvent.click(screen.getByRole("button", { name: "Save camera" }));
  await screen.findByRole("alert");
  expect(rpc).not.toHaveBeenCalled();
  expect((description as HTMLTextAreaElement).value).toBe("Keep this edited description");
  expect((included as HTMLTextAreaElement).value).toBe("0 × Battery");
  await userEvent.clear(included);
  await userEvent.type(included, "2 × Battery");
  await userEvent.click(screen.getByRole("button", { name: "Save camera" }));
  await waitFor(() => expect(rpc).toHaveBeenCalledOnce());
  expect(rpc).toHaveBeenCalledWith("save_camera_draft", { p_input: expect.objectContaining({ description: "Keep this edited description", accessories: [{ name: "Battery", quantity: 2 }] }) });
});

it("reports a failed unpublish and retries the same camera successfully", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: "Temporary database failure" } })
    .mockResolvedValueOnce({ data: null, error: null });
  render(<UnpublishCameraForm cameraId="11111111-1111-4111-8111-111111111111" />);
  await userEvent.click(screen.getByRole("button", { name: "Unpublish" }));
  expect((await screen.findByRole("alert")).textContent).toContain("could not be unpublished");
  await userEvent.click(screen.getByRole("button", { name: "Unpublish" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Camera unpublished."));
  expect(rpc.mock.calls).toEqual([
    ["unpublish_camera", { p_camera_id: "11111111-1111-4111-8111-111111111111" }],
    ["unpublish_camera", { p_camera_id: "11111111-1111-4111-8111-111111111111" }],
  ]);
  expect((screen.getByRole("button", { name: "Unpublish" }) as HTMLButtonElement).disabled).toBe(true);
});


it("saves changed camera details before continuing and stays on failed saves", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: "Temporary failure" } })
    .mockResolvedValueOnce({ data: "11111111-1111-4111-8111-111111111111", error: null });
  render(<><CameraDetailsForm camera={{ id: "11111111-1111-4111-8111-111111111111", name: "Test camera", description: "Synthetic kit", daily_rate: 450, security_deposit: 1000, accessories: [{ name: "Battery", quantity: 2 }] }} /><CameraDetailsContinueButton /></>);
  const price = screen.getByRole("spinbutton", { name: "Daily price" });
  await userEvent.clear(price);
  await userEvent.type(price, "451");
  const continueButton = screen.getByRole("button", { name: "Save camera and continue to availability" });
  await userEvent.click(continueButton);
  await screen.findByRole("alert");
  expect(redirect).not.toHaveBeenCalled();
  expect((price as HTMLInputElement).value).toBe("451");
  await userEvent.click(continueButton);
  await waitFor(() => expect(redirect).toHaveBeenCalledWith("/admin/cameras/11111111-1111-4111-8111-111111111111?step=availability"));
  expect(rpc).toHaveBeenLastCalledWith("save_camera_draft", { p_input: expect.objectContaining({ daily_rate: 451, accessories: [{ name: "Battery", quantity: 2 }] }) });
});
