/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { OwnerCamera } from "@/features/listings/owner-data";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-admin", () => ({ requirePageAdmin: vi.fn() }));
vi.mock("@/features/listings/owner-data", () => ({ loadOwnerCamera: vi.fn(), loadOwnerManualBlocks: vi.fn() }));
vi.mock("@/features/listings/handoff-data", () => ({ loadAdminCameraHandoffPolicy: vi.fn() }));

import { requirePageAdmin } from "@/lib/auth/require-admin";
import { loadOwnerCamera } from "@/features/listings/owner-data";
import { loadAdminCameraHandoffPolicy } from "@/features/listings/handoff-data";
import ManageCameraPage from "./page";

const cameraId = "95000000-0000-4000-8000-000000000001";
const placeId = "95000000-0000-4000-8000-000000000002";
let camera: OwnerCamera;
let assigned: boolean;

beforeEach(() => {
  camera = {
    id: cameraId, slug: "test-camera", name: "Test camera", description: "Synthetic camera",
    accessories: [], daily_rate: 100, security_deposit: 0, photo_count: 1,
    status: "draft", published_at: null, upcoming_rentals: 0,
    handoff: { enabled: true, allowed_weekdays: [1], approved_times: ["09:00"], pickup_area: "Lahug", version: 1 },
  };
  assigned = true;
  const place = { id: placeId, version: 1, name: "Test meetup", address: "Public test place", city: "Cebu City", latitude: 10, longitude: 123, arrival_instructions: "", attribution: null };
  vi.mocked(requirePageAdmin).mockResolvedValue({ supabase: {
    from: (table: string) => {
      const query = {
        select: () => query, is: () => query, eq: () => query,
        order: async () => ({ error: null, data: table === "meetup_places" ? [place] : assigned ? [{ place_id: placeId, display_order: 0 }] : [] }),
      };
      return query;
    },
  } } as never);
  vi.mocked(loadOwnerCamera).mockImplementation(async () => ({ status: "success", camera }));
  vi.mocked(loadAdminCameraHandoffPolicy).mockResolvedValue({ status: "success", policy: {
    allowedWeekdays: [1], approvedTimes: ["09:00"], cameraId, cameraName: "Test camera", cameraStatus: "draft",
    cityLabel: "Lahug", enabled: true, timezone: "Asia/Manila", version: 1, canonicalAnchor: null,
  } });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

async function preview() {
  render(await ManageCameraPage({ params: Promise.resolve({ cameraId }), searchParams: Promise.resolve({ step: "preview" }) }));
}

it("routes an owner missing photos to the photo editor without offering a doomed publish", async () => {
  camera.photo_count = 0;
  await preview();
  expect(screen.queryByRole("button", { name: "Publish camera" })).toBeNull();
  expect(screen.getByRole("link", { name: "Add photos" }).getAttribute("href")).toBe(`/admin/cameras/${cameraId}?step=camera#camera-photos`);
});

it("routes missing availability and meetup requirements to their editing step", async () => {
  camera.handoff = null;
  assigned = false;
  await preview();
  expect(screen.queryByRole("button", { name: "Publish camera" })).toBeNull();
  expect(screen.getByRole("link", { name: "Set availability and meetup places" }).getAttribute("href")).toBe(`/admin/cameras/${cameraId}?step=availability`);
});

it("does not offer publication when availability alone is incomplete", async () => {
  camera.handoff = null;
  await preview();
  expect(screen.queryByRole("button", { name: "Publish camera" })).toBeNull();
});

it("offers publication when every readiness item is satisfied", async () => {
  await preview();
  expect((screen.getByRole("button", { name: "Publish camera" }) as HTMLButtonElement).disabled).toBe(false);
});

it("keeps the listing link for an already published camera without republishing", async () => {
  camera.status = "published";
  camera.photo_count = 0;
  await preview();
  expect(screen.getByRole("link", { name: "View listing" }).getAttribute("href")).toBe("/cameras/test-camera");
  expect(screen.queryByRole("button", { name: "Publish camera" })).toBeNull();
});
