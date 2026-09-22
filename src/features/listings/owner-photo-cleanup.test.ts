import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: vi.fn() }));

import { requireAdmin } from "@/lib/auth/require-admin";
import { uploadCameraPhoto } from "./owner-actions";

beforeEach(() => vi.resetAllMocks());

it.each(["returned", "thrown"])("preserves the publication for recovery after a %s upload failure", async (failure) => {
  const remove = vi.fn();
  const upload = failure === "returned"
    ? vi.fn().mockResolvedValue({ error: { message: "Synthetic interrupted upload" } })
    : vi.fn().mockRejectedValue(new Error("Synthetic interrupted upload"));
  const download = vi.fn().mockResolvedValue({ data: null, error: { statusCode: "404", message: "Object not found" } });
  const rpc = vi.fn().mockImplementation(async (_name, args) => ({
    data: { id: args.p_publication_id, camera_id: args.p_camera_id,
      expected_byte_size: args.p_byte_size, expected_media_type: args.p_media_type, expected_sha256: args.p_sha256_hex,
      staging_object_path: "synthetic/staging.jpg", public_object_path: "synthetic/public.jpg", status: "awaiting_upload" }, error: null,
  }));
  vi.mocked(requireAdmin).mockResolvedValue({ supabase: {
    schema: () => ({ rpc }), storage: { from: () => ({ upload, remove, download }) },
  } } as never);
  const data = new FormData();
  data.set("cameraId", "95000000-0000-4000-8000-000000000001");
  data.set("publicationId", "95000000-0000-4000-8000-000000000003");
  data.set("cameraName", "Synthetic camera");
  data.set("photo", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "synthetic.jpg", { type: "image/jpeg" }));
  await expect(uploadCameraPhoto({ status: "idle" }, data)).resolves.toMatchObject({ status: "error", error: expect.stringContaining("Retry the unchanged photo") });
  expect(remove).not.toHaveBeenCalled();
  expect(rpc.mock.calls.map(([name]) => name)).toEqual(["create_catalog_photo_publication"]);
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
