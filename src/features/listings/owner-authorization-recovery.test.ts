import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: vi.fn() }));
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  blockCameraDates, createCameraDraft, publishCamera, removeCameraBlock,
  unpublishCamera, updateCameraDraft, uploadCameraPhoto,
} from "./owner-actions";

beforeEach(() => vi.resetAllMocks());

it.each([
  ["create", createCameraDraft], ["update", updateCameraDraft],
  ["upload", uploadCameraPhoto], ["publish", publishCamera],
  ["unpublish", unpublishCamera], ["block", blockCameraDates],
  ["unblock", removeCameraBlock],
] as const)("keeps the %s action recoverable when administrator verification fails", async (_name, action) => {
  vi.mocked(requireAdmin).mockRejectedValue(new Error("Synthetic private authorization service failure"));
  const data = new FormData();
  data.set("cameraId", "95000000-0000-4000-8000-000000000001");
  data.set("publicationId", "95000000-0000-4000-8000-000000000003");
  data.set("blockId", "95000000-0000-4000-8000-000000000002");
  data.set("name", "Synthetic camera");
  data.set("description", "Synthetic camera description.");
  data.set("dailyRate", "450");
  data.set("deposit", "1000");
  data.set("included", "2 × Battery");
  data.set("startDate", "2099-08-24");
  data.set("endDate", "2099-08-25");
  data.set("photo", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "synthetic.jpg", { type: "image/jpeg" }));
  await expect(action({ status: "idle" }, data)).resolves.toEqual({
    status: "error", error: "Administrator authorization could not be verified. Reload before retrying.",
  });
  expect(requireAdmin).toHaveBeenCalledOnce();
});
