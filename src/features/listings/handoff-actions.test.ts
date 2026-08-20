import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: vi.fn() }));

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/require-admin";

import { saveCameraHandoffPolicy } from "./handoff-actions";

const CAMERA_ID = "11111111-1111-4111-8111-111111111111";

function validFields() {
  const data = new FormData();
  data.set("cameraId", CAMERA_ID);
  data.set("expectedVersion", "2");
  data.set("cityLabel", "Cebu City");
  data.set("providerCityId", "geoapify:cebu-city");
  data.set("latitude", "10.31570");
  data.set("longitude", "123.88540");
  data.append("weekdays", "1");
  data.append("weekdays", "3");
  data.set("approvedTimes", "09:00\n17:00");
  data.set("enabled", "on");
  return data;
}

function authorize(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result);
  const schema = vi.fn(() => ({ rpc }));
  vi.mocked(requireAdmin).mockResolvedValue({
    supabase: { schema },
    user: { id: "admin-user" },
  } as never);
  return { rpc, schema };
}

describe("saveCameraHandoffPolicy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("validates enabled schedules and duplicates before authorization", async () => {
    const data = validFields();
    data.delete("weekdays");
    data.set("approvedTimes", "09:00,09:00");

    await expect(
      saveCameraHandoffPolicy({ status: "idle" }, data),
    ).resolves.toMatchObject({
      error: "invalid_input",
      fieldErrors: {
        approvedTimes: expect.any(String),
        weekdays: expect.any(String),
      },
      status: "error",
    });
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("denies a direct unauthorized action without invoking the RPC", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error("private auth detail"));

    await expect(
      saveCameraHandoffPolicy({ status: "idle" }, validFields()),
    ).resolves.toEqual({ error: "unauthorized", status: "error" });
  });

  it("sends only validated fields and revalidates persisted read paths", async () => {
    const api = authorize({ data: 3, error: null });
    const data = validFields();
    data.set("actorId", "attacker-controlled");
    data.set("timezone", "Pacific/Honolulu");

    await expect(
      saveCameraHandoffPolicy({ status: "idle" }, data),
    ).resolves.toEqual({ status: "success", version: 3 });
    expect(api.schema).toHaveBeenCalledWith("api");
    expect(api.rpc).toHaveBeenCalledWith("replace_camera_handoff_policy", {
      p_allowed_weekdays: [1, 3],
      p_approved_times: ["09:00", "17:00"],
      p_camera_id: CAMERA_ID,
      p_city_label: "Cebu City",
      p_country_code: "PH",
      p_enabled: true,
      p_expected_version: 2,
      p_latitude: 10.3157,
      p_longitude: 123.8854,
      p_provider_city_id: "geoapify:cebu-city",
    });
    expect(JSON.stringify(api.rpc.mock.calls)).not.toMatch(
      /attacker-controlled|Pacific\/Honolulu/,
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
    expect(revalidatePath).toHaveBeenCalledWith(
      `/admin/cameras/${CAMERA_ID}/handoff`,
    );
  });

  it.each([
    ["40001", "stale"],
    ["42501", "unauthorized"],
    ["22023", "save_failed"],
  ])("maps %s without returning private database detail", async (code, error) => {
    authorize({
      data: null,
      error: { code, message: "private provider city and coordinates" },
    });

    const result = await saveCameraHandoffPolicy(
      { status: "idle" },
      validFields(),
    );

    expect(result).toEqual({ error, status: "error" });
    expect(JSON.stringify(result)).not.toContain("private provider");
  });
});
