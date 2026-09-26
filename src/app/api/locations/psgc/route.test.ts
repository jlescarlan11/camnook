import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));

import { requireUser } from "@/lib/auth/require-user";

import { GET } from "./route";

function authorize(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  vi.mocked(requireUser).mockResolvedValue({
    supabase: { schema: vi.fn(() => ({ rpc })) },
  } as never);
  return rpc;
}

describe("authenticated PSGC choices route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the address catalogue separately from parent choices", async () => {
    const rpc = authorize({release: "2026-q2", nodes: [{
      code: "1300000000", name: "NCR", type: "region", city_class: null,
      has_children: true, parentCode: null,
    }]});
    const response = await GET(new Request("https://camnook.example/api/locations/psgc?view=address-reference"));
    expect(response.status).toBe(200);
    expect((await response.json()).nodes[0].code).toBe("1300000000");
    expect(rpc).toHaveBeenCalledWith("list_psgc_address_reference");
    expect(response.headers.get("cache-control")).toBe("private, max-age=300");
  });
  it("rejects mixed query modes", async () => {
    const rpc = authorize(null);
    const response = await GET(new Request("https://camnook.example/api/locations/psgc?view=address-reference&parent=1300000000"));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("denies unauthenticated reference discovery", async () => {
    vi.mocked(requireUser).mockRejectedValue(new Error("private auth detail"));
    const response = await GET(new Request("https://camnook.example/api/locations/psgc"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("returns a strictly validated privately cached cascade", async () => {
    const rpc = authorize({
      choices: [{
        city_class: "HUC",
        code: "0730600000",
        has_children: true,
        name: "City of Cebu",
        type: "city",
      }],
      release: "2026-q2",
    });
    const response = await GET(new Request(
      "https://camnook.example/api/locations/psgc?parent=0700000000",
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(rpc).toHaveBeenCalledWith("list_psgc_area_choices", {
      p_parent_code: "0700000000",
    });
    await expect(response.json()).resolves.toMatchObject({ release: "2026-q2" });
  });

  it("rejects malformed parents without querying the database", async () => {
    const rpc = authorize(null);
    const response = await GET(new Request(
      "https://camnook.example/api/locations/psgc?parent=../../private",
    ));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
