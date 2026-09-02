import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/lib/supabase/config", () => ({
  getSupabasePublicConfig: () => ({
    publishableKey: "redacted",
    url: "https://project.supabase.co",
  }),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  buildPublicCameraPhotoUrl,
  loadCatalog,
  loadPublicCamera,
  publicCatalogPresentation,
} from "./catalog";

const CAMERA_ID = "11111111-1111-4111-8111-111111111111";

function catalogClient(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  const schema = vi.fn(() => ({ rpc }));
  return { client: { schema } as never, rpc };
}

function cameraSnapshot(altText: string | null = "Front of camera") {
  return {
    accessories: [{ name: "Battery", quantity: 2 }],
    availability: [{
      ends_at: "2099-08-16T00:00:00Z",
      reason: "booked",
      starts_at: "2099-08-15T00:00:00Z",
    }],
    daily_rate: 1500,
    description: "Compact mirrorless camera",
    handoff_policy: {
      allowed_weekdays: [1, 3, 5],
      approved_times: ["09:00", "17:00"],
      city_label: "Cebu City",
      enabled: true,
      timezone: "Asia/Manila",
      version: 2,
    },
    id: CAMERA_ID,
    name: "Fujifilm X-T5",
    photos: [{
      alt_text: altText,
      object_path: "published/camera-1/front.jpg",
    }],
    published_at: "2026-08-13T00:00:00Z",
    security_deposit: 5000,
    slug: "fujifilm-x-t5",
  };
}

describe("public catalog data", () => {
  beforeEach(() => vi.clearAllMocks());

  it("constructs encoded public camera-listings URLs and rejects unsafe paths", () => {
    expect(
      buildPublicCameraPhotoUrl(
        "https://project.supabase.co",
        "published/Fuji X-T5/front image.jpg",
      ),
    ).toBe(
      "https://project.supabase.co/storage/v1/object/public/camera-listings/published/Fuji%20X-T5/front%20image.jpg",
    );
    expect(
      buildPublicCameraPhotoUrl("https://project.supabase.co", "../private/id.jpg"),
    ).toBeNull();
    expect(
      buildPublicCameraPhotoUrl("https://project.supabase.co", "/absolute.jpg"),
    ).toBeNull();
  });

  it("loads the complete public catalog through one strict snapshot RPC", async () => {
    const fixture = catalogClient([cameraSnapshot()]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fixture.client);

    await expect(loadCatalog()).resolves.toEqual({
      cameras: [
        {
          accessories: [{ name: "Battery", quantity: 2 }],
          availability: [{
            endsAt: "2099-08-16T00:00:00Z",
            reason: "booked",
            startsAt: "2099-08-15T00:00:00Z",
          }],
          dailyRate: 1500,
          description: "Compact mirrorless camera",
          handoffPolicy: {
            allowedWeekdays: [1, 3, 5],
            approvedTimes: ["09:00", "17:00"],
            approximationLevel: "legacy_city",
            cityLabel: "Cebu City",
            enabled: true,
            psgcAreaCode: null,
            psgcRelease: null,
            timezone: "Asia/Manila",
            version: 2,
          },
          id: CAMERA_ID,
          name: "Fujifilm X-T5",
          photos: [{
            alt: "Front of camera",
            url: "https://project.supabase.co/storage/v1/object/public/camera-listings/published/camera-1/front.jpg",
          }],
          securityDeposit: 5000,
          slug: "fujifilm-x-t5",
        },
      ],
      status: "success",
    });
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(fixture.rpc).toHaveBeenCalledWith("get_public_catalog_snapshot");
  });

  it.each([null, "", "   "])(
    "retains a real photo and falls back to the camera name when alt text is %j",
    async (altText) => {
      const fixture = catalogClient([cameraSnapshot(altText)]);
      vi.mocked(createSupabaseServerClient).mockResolvedValue(fixture.client);

      await expect(loadCatalog()).resolves.toMatchObject({
        cameras: [{ photos: [{ alt: "Fujifilm X-T5" }] }],
        status: "success",
      });
    },
  );

  it("distinguishes an honest empty catalog from a safe read failure", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      catalogClient([]).client,
    );
    expect(publicCatalogPresentation(await loadCatalog())).toEqual({
      kind: "empty",
      message: "No cameras are published right now. Please check back later.",
      showRequestControl: false,
    });

    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      catalogClient(null, { message: "database hostname and private relation" }).client,
    );
    const result = publicCatalogPresentation(await loadCatalog());
    expect(result).toEqual({
      kind: "error",
      message: "We couldn’t load the camera catalog. Please try again.",
      showRequestControl: false,
    });
    expect(JSON.stringify(result)).not.toContain("private relation");
  });

  it("fails closed if the public snapshot unexpectedly contains private fields", async () => {
    const fixture = catalogClient([{
      ...cameraSnapshot(),
      serial_number: "PRIVATE-SERIAL",
    }]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fixture.client);

    await expect(loadCatalog()).resolves.toEqual({ status: "error" });
  });

  it("loads one camera detail through the slug-targeted snapshot", async () => {
    const fixture = catalogClient(cameraSnapshot());
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fixture.client);

    await expect(loadPublicCamera("fujifilm-x-t5")).resolves.toMatchObject({
      camera: { id: CAMERA_ID, name: "Fujifilm X-T5" },
      status: "success",
    });
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(fixture.rpc).toHaveBeenCalledWith(
      "get_public_camera_snapshot",
      { p_slug: "fujifilm-x-t5" },
    );
  });

  it("distinguishes a missing camera and rejects an invalid slug without a read", async () => {
    const fixture = catalogClient(null);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fixture.client);

    await expect(loadPublicCamera("missing-camera")).resolves.toEqual({
      status: "missing",
    });
    await expect(loadPublicCamera("../PRIVATE")).resolves.toEqual({
      status: "missing",
    });
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
  });
});
