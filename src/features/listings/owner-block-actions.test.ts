import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: vi.fn() }));

import { requireAdmin } from "@/lib/auth/require-admin";
import { blockCameraDates } from "./owner-actions";

beforeEach(() => vi.resetAllMocks());

it.each([
  ["23P01", "Those dates overlap another unavailable period."],
  ["42501", "Administrator authorization is required to block dates."],
  ["57014", "The blocked dates could not be confirmed. Reload availability before retrying."],
  ["", "The blocked dates could not be confirmed. Reload availability before retrying."],
])("reports the correct recovery for a manual-block error %s", async (code, message) => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { code, message: "Synthetic private database detail" } });
  vi.mocked(requireAdmin).mockResolvedValue({ supabase: { schema: () => ({ rpc }) } } as never);
  const data = new FormData();
  data.set("cameraId", "95000000-0000-4000-8000-000000000001");
  data.set("startDate", "2099-08-24");
  data.set("endDate", "2099-08-25");
  await expect(blockCameraDates({ status: "idle" }, data)).resolves.toEqual({ status: "error", error: message });
  expect(rpc).toHaveBeenCalledOnce();
});
