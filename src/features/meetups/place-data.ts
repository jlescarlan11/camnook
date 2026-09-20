import "server-only";
import { z } from "zod";
import type { requireUser } from "@/lib/auth/require-user";
import { placeSchema } from "./places";

export async function loadCameraMeetupPlaces(
  context: Awaited<ReturnType<typeof requireUser>>,
  cameraId: string,
) {
  const { data, error } = await context.supabase
    .schema("api")
    .rpc("get_camera_meetup_places", { p_camera_id: cameraId });
  if (error) throw new Error("Meetup places unavailable");
  return z.array(placeSchema).max(3).parse(data);
}
