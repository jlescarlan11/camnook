/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: async () => ({ supabase: { schema: () => ({ rpc }) } }) }));
import { OwnerManualBlocks } from "./owner-manual-blocks";
import { loadOwnerManualBlocks } from "./owner-data";

const cameraId = "11111111-1111-4111-8111-111111111111";
const blockId = "22222222-2222-4222-8222-222222222222";
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("retains a blocked range after a removal failure and retries the same block", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { code: "08006" } }).mockResolvedValueOnce({ data: null, error: null });
  render(<OwnerManualBlocks cameraId={cameraId} result={{ status: "success", blocks: [{ id: blockId, kind: "manual", starts_at: "2099-08-24T00:00:00+08:00", ends_at: "2099-08-26T00:00:00+08:00" }] }} />);
  expect(screen.getByText(/From August 24, 2099 at 12:00 AM until August 26/)).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Remove block" }));
  expect((await screen.findByRole("alert")).textContent).toContain("could not be removed");
  expect(screen.queryByText("Block removed.")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Remove block" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Block removed."));
  expect(rpc.mock.calls).toEqual([["release_manual_block", { p_block_id: blockId }], ["release_manual_block", { p_block_id: blockId }]]);
  expect((screen.getByRole("button", { name: "Remove block" }) as HTMLButtonElement).disabled).toBe(true);
});

it("keeps unavailable block data distinct from an empty schedule", async () => {
  const context = { supabase: { schema: () => ({ rpc }) } } as unknown as Parameters<typeof loadOwnerManualBlocks>[0];
  rpc.mockResolvedValueOnce({ data: null, error: { code: "08006" } });
  const result = await loadOwnerManualBlocks(context, cameraId);
  expect(result).toEqual({ status: "error" });
  render(<OwnerManualBlocks cameraId={cameraId} result={result} />);
  expect(screen.queryByText("No active or upcoming blocked dates.")).toBeNull();
  const retry = screen.getByRole("button", { name: "Retry blocked dates" }) as HTMLButtonElement;
  expect(retry.form?.getAttribute("action")).toBe(`/admin/cameras/${cameraId}`);
  expect(retry.form?.querySelector<HTMLInputElement>('[name="step"]')?.value).toBe("availability");
  rpc.mockResolvedValueOnce({ data: [], error: null });
  expect(await loadOwnerManualBlocks(context, cameraId)).toEqual({ status: "success", blocks: [] });
  rpc.mockResolvedValueOnce({ data: [{ id: blockId, kind: "booking" }], error: null });
  expect(await loadOwnerManualBlocks(context, cameraId)).toEqual({ status: "error" });
});
