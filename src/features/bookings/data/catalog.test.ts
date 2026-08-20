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
  publicCatalogPresentation,
} from "./catalog";

function catalogClient(results: Record<string, { data: unknown; error: unknown }>) {
  const selections = new Map<string, string>();
  const filters = new Map<string, unknown[]>();
  const from = vi.fn((table: string) => ({
    select: vi.fn((columns: string) => {
      selections.set(table, columns);
      const ordered = {
        order: vi.fn().mockResolvedValue(results[table]),
      };
      return {
        ...ordered,
        is: vi.fn((column: string, value: unknown) => {
          filters.set(table, [column, value]);
          return ordered;
        }),
      };
    }),
  }));
  return { client: { from } as never, filters, from, selections };
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

  it("queries only approved public/accessory fields and reduces rows to safe DTOs", async () => {
    const fixture = catalogClient({
      camera_accessories: {
        data: [
          {
            camera_id: "camera-1",
            name: "Battery",
            quantity: 2,
            replacement_value: 99999,
          },
        ],
        error: null,
      },
      public_availability: {
        data: [
          {
            booking_id: "private-booking",
            camera_id: "camera-1",
            ends_at: "2099-08-16T00:00:00Z",
            reason: "booked",
            starts_at: "2099-08-15T00:00:00Z",
          },
        ],
        error: null,
      },
      public_camera_photos: {
        data: [
          {
            alt_text: "Front of camera",
            camera_id: "camera-1",
            id: "photo-1",
            object_path: "published/camera-1/front.jpg",
            private_path: "ids/user-1.jpg",
            sort_position: 0,
          },
        ],
        error: null,
      },
      public_camera_handoff_policies: {
        data: [
          {
            allowed_weekdays: [1, 3, 5],
            approved_times: ["09:00", "17:00"],
            camera_id: "camera-1",
            city_label: "Cebu City",
            enabled: true,
            latitude: 10.3157,
            provider_city_id: "private-provider-id",
            timezone: "Asia/Manila",
            version: 2,
          },
        ],
        error: null,
      },
      public_cameras: {
        data: [
          {
            acquisition_cost: 90000,
            daily_rate: 1500,
            description: "Compact mirrorless camera",
            id: "camera-1",
            internal_notes: "private",
            name: "Fujifilm X-T5",
            published_at: "2026-08-13T00:00:00Z",
            replacement_value: 100000,
            security_deposit: 5000,
            serial_number: "secret",
            slug: "fujifilm-x-t5",
          },
        ],
        error: null,
      },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fixture.client);

    await expect(loadCatalog()).resolves.toEqual({
      cameras: [
        {
          accessories: [{ name: "Battery", quantity: 2 }],
          availability: [
            {
              endsAt: "2099-08-16T00:00:00Z",
              reason: "booked",
              startsAt: "2099-08-15T00:00:00Z",
            },
          ],
          dailyRate: 1500,
          description: "Compact mirrorless camera",
          handoffPolicy: {
            allowedWeekdays: [1, 3, 5],
            approvedTimes: ["09:00", "17:00"],
            cityLabel: "Cebu City",
            enabled: true,
            timezone: "Asia/Manila",
            version: 2,
          },
          id: "camera-1",
          name: "Fujifilm X-T5",
          photos: [
            {
              alt: "Front of camera",
              url: "https://project.supabase.co/storage/v1/object/public/camera-listings/published/camera-1/front.jpg",
            },
          ],
          securityDeposit: 5000,
          slug: "fujifilm-x-t5",
        },
      ],
      status: "success",
    });
    expect(fixture.selections.get("public_cameras")).toBe(
      "id,slug,name,description,daily_rate,security_deposit,published_at",
    );
    expect(fixture.selections.get("public_camera_photos")).toBe(
      "id,camera_id,object_path,alt_text,sort_position",
    );
    expect(fixture.selections.get("camera_accessories")).toBe(
      "camera_id,name,quantity,sort_position",
    );
    expect(fixture.filters.get("camera_accessories")).toEqual([
      "archived_at",
      null,
    ]);
    expect(fixture.selections.get("public_availability")).toBe(
      "camera_id,starts_at,ends_at,reason",
    );
    expect(fixture.selections.get("public_camera_handoff_policies")).toBe(
      "camera_id,city_label,allowed_weekdays,approved_times,timezone,enabled,version",
    );
    expect(JSON.stringify((await loadCatalog()) as unknown)).not.toContain("secret");
    expect(JSON.stringify((await loadCatalog()) as unknown)).not.toContain(
      "private-provider-id",
    );
  });

  it.each([null, "", "   "])(
    "retains a real photo and falls back to the camera name when alt text is %j",
    async (altText) => {
      const fixture = catalogClient({
        camera_accessories: { data: [], error: null },
        public_availability: { data: [], error: null },
        public_camera_photos: {
          data: [
            {
              alt_text: altText,
              camera_id: "camera-1",
              id: "photo-1",
              object_path: "published/camera-1/real-photo.jpg",
              sort_position: 0,
            },
          ],
          error: null,
        },
        public_camera_handoff_policies: { data: [], error: null },
        public_cameras: {
          data: [
            {
              daily_rate: 1500,
              description: "Compact mirrorless camera",
              id: "camera-1",
              name: "Fujifilm X-T5",
              published_at: "2026-08-13T00:00:00Z",
              security_deposit: 5000,
              slug: "fujifilm-x-t5",
            },
          ],
          error: null,
        },
      });
      vi.mocked(createSupabaseServerClient).mockResolvedValue(fixture.client);

      const result = await loadCatalog();

      expect(result).toMatchObject({
        cameras: [
          {
            photos: [
              {
                alt: "Fujifilm X-T5",
                url: "https://project.supabase.co/storage/v1/object/public/camera-listings/published/camera-1/real-photo.jpg",
              },
            ],
          },
        ],
        status: "success",
      });
    },
  );

  it("distinguishes an honest empty catalog from a safe read failure", async () => {
    const empty = catalogClient({
      camera_accessories: { data: [], error: null },
      public_availability: { data: [], error: null },
      public_camera_photos: { data: [], error: null },
      public_camera_handoff_policies: { data: [], error: null },
      public_cameras: { data: [], error: null },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(empty.client);
    expect(publicCatalogPresentation(await loadCatalog())).toEqual({
      kind: "empty",
      message: "No cameras are published right now. Please check back later.",
      showRequestControl: false,
    });

    const failed = catalogClient({
      camera_accessories: { data: [], error: null },
      public_availability: { data: [], error: null },
      public_camera_photos: { data: [], error: null },
      public_camera_handoff_policies: { data: [], error: null },
      public_cameras: {
        data: null,
        error: { message: "database hostname and private relation" },
      },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(failed.client);
    const result = publicCatalogPresentation(await loadCatalog());
    expect(result).toEqual({
      kind: "error",
      message: "We couldn’t load the camera catalog. Please try again.",
      showRequestControl: false,
    });
    expect(JSON.stringify(result)).not.toContain("private relation");
  });

  it.each([
    "public_cameras",
    "public_camera_photos",
    "camera_accessories",
    "public_availability",
    "public_camera_handoff_policies",
  ])("constrains a %s query failure", async (failedTable) => {
    const tables = {
      camera_accessories: { data: [], error: null as unknown },
      public_availability: { data: [], error: null as unknown },
      public_camera_photos: { data: [], error: null as unknown },
      public_camera_handoff_policies: { data: [], error: null as unknown },
      public_cameras: { data: [], error: null as unknown },
    };
    tables[failedTable as keyof typeof tables] = {
      data: [],
      error: { message: `${failedTable} private provider detail` },
    };
    const fixture = catalogClient(tables);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fixture.client);

    const result = publicCatalogPresentation(await loadCatalog());
    expect(result).toMatchObject({ kind: "error", showRequestControl: false });
    expect(JSON.stringify(result)).not.toContain("provider detail");
  });
});
