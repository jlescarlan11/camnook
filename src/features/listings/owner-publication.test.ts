import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: vi.fn() }));
import { requireAdmin } from "@/lib/auth/require-admin";
import { publishCamera } from "./owner-actions";

const cameraId = "95000000-0000-4000-8000-000000000001";
const valid = { id: cameraId, status: "published", published_at: "2026-09-22T00:00:00Z" };
beforeEach(() => vi.resetAllMocks());

it.each([
  { data: null, error: null, expected: "unconfirmed" },
  { data: { ...valid, id: "95000000-0000-4000-8000-000000000002" }, error: null, expected: "unconfirmed" },
  { data: { ...valid, status: "draft" }, error: null, expected: "unconfirmed" },
  { data: null, error: { code: "57014" }, expected: "unconfirmed" },
  { data: null, error: { code: "23514" }, expected: "readiness" },
  { data: valid, error: null, expected: "success" },
])("reports publication only from a matching acknowledgement: $expected", async ({ data, error, expected }) => {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  vi.mocked(requireAdmin).mockResolvedValue({ supabase: { schema: () => ({ rpc }) } } as never);
  const form = new FormData();
  form.set("cameraId", cameraId);
  await expect(publishCamera({ status: "idle" }, form)).resolves.toEqual(expected === "success"
    ? { status: "success" }
    : { status: "error", error: expected === "readiness"
      ? "Complete every readiness item before publishing."
      : "The publication outcome could not be confirmed. Reload before retrying." });
  expect(rpc).toHaveBeenCalledOnce();
});
