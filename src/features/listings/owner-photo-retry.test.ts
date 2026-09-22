import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: vi.fn() }));
import { requireAdmin } from "@/lib/auth/require-admin";
import { uploadCameraPhoto } from "./owner-actions";

beforeEach(() => vi.resetAllMocks());

it("reconciles a committed photo after a lost acknowledgement without creating another publication", async () => {
  type Publication = { id: string; camera_id: string; expected_byte_size: number; expected_media_type: string; expected_sha256: string; staging_object_path: string; public_object_path: string; status: string };
  const publications = new Map<string, Publication>();
  const objects = new Map<string, Blob>();
  const upload = vi.fn(async (path: string, bytes: Buffer) => {
    objects.set(`draft-staging/${path}`, new Blob([new Uint8Array(bytes)]));
    return { error: null };
  });
  const copy = vi.fn(async (source: string, destination: string) => {
    objects.set(`camera-listings/${destination}`, objects.get(`draft-staging/${source}`)!);
    return { error: null };
  });
  let loseAcknowledgement = true;
  const rpc = vi.fn(async (name: string, args: Record<string, string | number>) => {
    const id = String(args.p_publication_id);
    let row = publications.get(id);
    if (name === "create_catalog_photo_publication" && !row) {
      row = { id, camera_id: String(args.p_camera_id), expected_byte_size: Number(args.p_byte_size), expected_media_type: String(args.p_media_type), expected_sha256: String(args.p_sha256_hex), staging_object_path: `${id}/staging.jpg`, public_object_path: `${id}/public.jpg`, status: "awaiting_upload" };
      publications.set(id, row);
    }
    if (!row) throw new Error("Synthetic fixture missing publication");
    if (name === "mark_catalog_photo_ready") row.status = "ready_to_copy";
    if (name === "finalize_catalog_photo_publication") {
      row.status = "published";
      if (loseAcknowledgement) {
        loseAcknowledgement = false;
        return { data: null, error: { code: "", message: "Synthetic acknowledgement lost" } };
      }
    }
    if (name === "prepare_catalog_photo_abort") return { data: null, error: { code: "22023" } };
    return { data: { ...row }, error: null };
  });
  vi.mocked(requireAdmin).mockResolvedValue({ supabase: {
    schema: () => ({ rpc }), storage: { from: (bucket: string) => ({
      upload, copy,
      download: async (path: string) => objects.has(`${bucket}/${path}`)
        ? { data: objects.get(`${bucket}/${path}`), error: null }
        : { data: null, error: { statusCode: "404", message: "Object not found" } },
      remove: async (paths: string[]) => { paths.forEach((path) => objects.delete(`${bucket}/${path}`)); return { data: [], error: null }; },
    }) },
  } } as never);
  const data = new FormData();
  data.set("cameraId", "95000000-0000-4000-8000-000000000001");
  data.set("publicationId", "95000000-0000-4000-8000-000000000003");
  data.set("cameraName", "Synthetic camera");
  data.set("sortPosition", "0");
  data.set("photo", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], "synthetic.jpg", { type: "image/jpeg" }));
  await expect(uploadCameraPhoto({ status: "idle" }, data)).resolves.toMatchObject({ status: "error" });
  await expect(uploadCameraPhoto({ status: "idle" }, data)).resolves.toEqual({ status: "success" });
  expect(publications.size).toBe(1);
  expect([...publications.values()][0].status).toBe("published");
  expect(upload).toHaveBeenCalledOnce();
  expect(copy).toHaveBeenCalledOnce();
});
