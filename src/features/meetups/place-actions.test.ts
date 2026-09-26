import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("./provider-budget", () => ({
  claimGeoapifyProviderBudget: vi.fn().mockResolvedValue(false),
}));
import { requireAdmin } from "@/lib/auth/require-admin";
import { saveMeetupPlace, assignCameraMeetupPlaces, archiveMeetupPlace, searchMeetupPlaces } from "./place-actions";
import { claimGeoapifyProviderBudget } from "./provider-budget";
const rpc = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({
    data: "44444444-4444-4444-8444-444444444444",
    error: null,
  });
  vi.mocked(requireAdmin).mockResolvedValue({
    user: { id: "owner" },
    supabase: { schema: () => ({ rpc }) },
  } as never);
});
function fields() {
  const f = new FormData();
  Object.entries({
    creationId: "55555555-5555-4555-8555-555555555555",
    name: "Public entrance",
    address: "Public road, Cebu City",
    city: "Cebu City",
    latitude: "10.315712",
    longitude: "123.885423",
    arrival_instructions: "Beside the café",
    confirmPin: "on",
    source: "manual_pin",
  }).forEach(([k, v]) => f.set(k, v));
  return f;
}
it.each([
  ["save", saveMeetupPlace], ["archive", archiveMeetupPlace], ["assign", assignCameraMeetupPlaces],
] as const)("keeps %s recoverable while denying unavailable administrator authorization", async (_name, action) => {
  vi.mocked(requireAdmin).mockRejectedValue(new Error("Synthetic private authorization failure"));
  const form = fields();
  form.set("id", "44444444-4444-4444-8444-444444444444");
  form.set("version", "1");
  form.set("camera", "11111111-1111-4111-8111-111111111111");
  form.append("places", "44444444-4444-4444-8444-444444444444");
  await expect(action({ status: "idle" }, form)).resolves.toEqual({
    status: "error", message: "Administrator authorization could not be verified. Reload before retrying.",
  });
  expect(rpc).not.toHaveBeenCalled();
});
it("saves the confirmed precision and handles a stale edit", async () => {
  expect(await saveMeetupPlace({ status: "idle" }, fields())).toMatchObject({
    status: "success",
  });
  expect(rpc).toHaveBeenCalledWith("save_meetup_place", {
    p_input: expect.objectContaining({
      creation_id: "55555555-5555-4555-8555-555555555555",
      latitude: 10.315712,
      longitude: 123.885423,
      source: "manual_pin",
      attribution: null,
    }),
  });
  rpc.mockResolvedValue({ error: { message: "meetup_changed" } });
  expect(await saveMeetupPlace({ status: "idle" }, fields())).toMatchObject({
    status: "error",
    message: expect.stringContaining("changed"),
  });
});
it("does not silently turn a missing coordinate into zero", async () => {
  const f = fields();
  f.set("latitude", "");
  expect(await saveMeetupPlace({ status: "idle" }, f)).toMatchObject({
    status: "error",
  });
  expect(rpc).not.toHaveBeenCalled();
  f.set("latitude", "10.315712");
  f.delete("confirmPin");
  expect(await saveMeetupPlace({ status: "idle" }, f)).toMatchObject({
    status: "error",
  });
  expect(rpc).not.toHaveBeenCalled();
});
it("requires a stable creation reference but preserves existing-place editing", async () => {
  const f = fields();
  f.delete("creationId");
  expect(await saveMeetupPlace({ status: "idle" }, f)).toMatchObject({ status: "error" });
  expect(rpc).not.toHaveBeenCalled();
  f.set("id", "44444444-4444-4444-8444-444444444444");
  f.set("version", "1");
  expect(await saveMeetupPlace({ status: "idle" }, f)).toMatchObject({ status: "success" });
  expect(rpc).toHaveBeenCalledWith("save_meetup_place", {
    p_input: expect.objectContaining({ id: "44444444-4444-4444-8444-444444444444", creation_id: null, version: 1 }),
  });
});
it("limits assignments to three places", async () => {
  const f = new FormData();
  f.set("camera", "11111111-1111-4111-8111-111111111111");
  for (let i = 0; i < 4; i++)
    f.append("places", "44444444-4444-4444-8444-444444444444");
  expect(await assignCameraMeetupPlaces({ status: "idle" }, f)).toMatchObject({
    status: "error",
  });
  expect(rpc).not.toHaveBeenCalled();
});
it("keeps an interrupted creation retryable without exposing transport details", async () => {
  rpc.mockRejectedValueOnce(new Error("synthetic private transport detail"));
  const form = fields();
  const failed = await saveMeetupPlace({ status: "idle" }, form);
  expect(failed).toMatchObject({ status: "error", message: expect.stringContaining("uncertain") });
  expect(JSON.stringify(failed)).not.toContain("synthetic private");
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(await saveMeetupPlace(failed, form)).toMatchObject({ status: "success" });
  expect(rpc.mock.calls[0][1]).toEqual(rpc.mock.calls[1][1]);
});

it("returns recoverable search guidance before spending provider budget when authorization fails", async () => {
  vi.mocked(requireAdmin).mockRejectedValue(new Error("Synthetic private authorization failure"));
  await expect(searchMeetupPlaces("Public entrance")).resolves.toEqual({
    error: "Administrator authorization could not be verified. Reload before retrying.",
    places: [],
  });
  expect(claimGeoapifyProviderBudget).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});
