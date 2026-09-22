import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: vi.fn() }));

import { requireAdmin } from "@/lib/auth/require-admin";
import { uploadCameraPhoto } from "./owner-actions";

beforeEach(() => vi.resetAllMocks());

it.each([false, true])("requires confirmed abort preparation before cleanup (prepared=%s)", async (prepared) => {
  const remove = vi.fn().mockResolvedValue({ error: null });
  const upload = vi.fn().mockResolvedValue({ error: { message: "Synthetic interrupted upload" } });
  const rpc = vi.fn().mockImplementation(async (name, args) => {
    if (name === "create_catalog_photo_publication") return {
      data: { staging_object_path: "synthetic/staging.jpg", public_object_path: "synthetic/public.jpg" }, error: null,
    };
    if (name === "prepare_catalog_photo_abort") return prepared
      ? { data: { id: args.p_publication_id, status: "abort_pending" }, error: null }
      : { data: null, error: { code: "22023" } };
    return { data: null, error: null };
  });
  vi.mocked(requireAdmin).mockResolvedValue({ supabase: {
    schema: () => ({ rpc }), storage: { from: () => ({ upload, remove }) },
  } } as never);
  const data = new FormData();
  data.set("cameraId", "95000000-0000-4000-8000-000000000001");
  data.set("cameraName", "Synthetic camera");
  data.set("photo", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "synthetic.jpg", { type: "image/jpeg" }));
  await expect(uploadCameraPhoto({ status: "idle" }, data)).resolves.toEqual({ status: "error", error: "The photo could not be uploaded." });
  expect(remove).toHaveBeenCalledTimes(prepared ? 2 : 0);
  expect(rpc.mock.calls.map(([name]) => name)).toEqual([
    "create_catalog_photo_publication", "prepare_catalog_photo_abort",
    ...(prepared ? ["finalize_catalog_photo_abort"] : []),
  ]);
});

it.each([
  ["image/jpeg", new Uint8Array([0x6e, 0x6f, 0x74, 0x2d, 0x61, 0x6e, 0x2d, 0x69, 0x6d, 0x61, 0x67, 0x65])],
  ["image/png", new Uint8Array([0xff, 0xd8, 0xff, 0xd9])],
])("rejects unsupported bytes or a mismatched %s claim before authorization", async (type, bytes) => {
  vi.mocked(requireAdmin).mockRejectedValue(new Error("Synthetic authorization should not be reached"));
  const data = new FormData();
  data.set("cameraId", "95000000-0000-4000-8000-000000000001");
  data.set("photo", new File([bytes], "synthetic-photo", { type }));
  await expect(uploadCameraPhoto({ status: "idle" }, data)).resolves.toEqual({
    status: "error", error: "Choose a JPEG, PNG, or WebP photo up to 10 MB.",
  });
  expect(requireAdmin).not.toHaveBeenCalled();
});
