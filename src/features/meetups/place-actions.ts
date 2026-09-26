"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { placeInputSchema } from "./places";
import { getMeetupProviderConfig } from "./config";
import { GeoapifyAdapter } from "./provider";
import { claimGeoapifyProviderBudget } from "./provider-budget";

export type PlaceActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

async function authorizePlaceAction() {
  try {
    return { context: await requireAdmin(), error: null } as const;
  } catch {
    return {
      context: null,
      error: {
        status: "error",
        message: "Administrator authorization could not be verified. Reload before retrying.",
      },
    } as const;
  }
}

export async function saveMeetupPlace(
  _: PlaceActionState,
  form: FormData,
): Promise<PlaceActionState> {
  const authorization = await authorizePlaceAction();
  if (!authorization.context) return authorization.error;
  const context = authorization.context;
  const values = Object.fromEntries(form);
  const parsed = placeInputSchema.safeParse(values);
  const id = z
    .uuid()
    .optional()
    .safeParse(values.id || undefined);
  const version = z.coerce.number().int().positive().safeParse(values.version);
  const creationId = z.uuid().safeParse(values.creationId);
  if (id.success && !id.data && !creationId.success) {
    return { status: "error", message: "Reload the form before adding a meetup place." };
  }
  if (
    !parsed.success ||
    !id.success ||
    (id.data && !version.success) ||
    values.confirmPin !== "on" ||
    !String(values.latitude ?? "").trim() ||
    !String(values.longitude ?? "").trim()
  )
    return {
      status: "error",
      message: "Complete the place details and confirm the public meetup pin.",
    };
  // All saved coordinates are explicitly confirmed by an authorized owner. Search assists that selection;
  // it does not grant authority to a renter or prove a venue's suitability.
  let result: { data: unknown; error: { message: string } | null };
  try {
    result = await context.supabase.schema("api").rpc("save_meetup_place", {
      p_input: {
        ...parsed.data,
        id: id.data ?? null,
        creation_id: id.data ? null : creationId.data!,
        version: version.success ? version.data : null,
        source:
          values.source === "provider_search" ? "provider_search" : "manual_pin",
        attribution:
          values.source === "provider_search"
            ? "© OpenStreetMap contributors · Powered by Geoapify"
            : null,
      },
    });
  } catch {
    return {
      status: "error",
      message: "The save outcome is uncertain. Reload to check the place, or retry the unchanged form.",
    };
  }
  if (result.error)
    return {
      status: "error",
      message: result.error.message.includes("meetup_changed")
        ? "This place changed. Reload before editing it."
        : "Could not save this place. Your changes are still here.",
    };
  if (!z.uuid().safeParse(result.data).success) {
    return { status: "error", message: "The save outcome is uncertain. Reload to check the place before making changes." };
  }
  revalidatePath("/admin/meetup-places");
  revalidatePath("/checkout");
  return { status: "success", message: "Meetup place saved." };
}
export async function archiveMeetupPlace(
  _: PlaceActionState,
  form: FormData,
): Promise<PlaceActionState> {
  const authorization = await authorizePlaceAction();
  if (!authorization.context) return authorization.error;
  const context = authorization.context;
  const input = z
    .object({ id: z.uuid(), version: z.coerce.number().int().positive() })
    .safeParse(Object.fromEntries(form));
  if (!input.success)
    return { status: "error", message: "Reload the place and try again." };
  const { error } = await context.supabase
    .schema("api")
    .rpc("archive_meetup_place", {
      p_place_id: input.data.id,
      p_version: input.data.version,
    });
  if (error)
    return {
      status: "error",
      message: "Could not archive this version. Reload and try again.",
    };
  revalidatePath("/admin/meetup-places");
  revalidatePath("/checkout");
  return {
    status: "success",
    message: "Archived. Existing bookings keep their saved place.",
  };
}
export async function assignCameraMeetupPlaces(
  _: PlaceActionState,
  form: FormData,
): Promise<PlaceActionState> {
  const authorization = await authorizePlaceAction();
  if (!authorization.context) return authorization.error;
  const context = authorization.context;
  const camera = z.uuid().safeParse(form.get("camera"));
  const ids = z.array(z.uuid()).max(3).safeParse(form.getAll("places"));
  if (!camera.success || !ids.success)
    return { status: "error", message: "Choose up to three active places." };
  const { error } = await context.supabase
    .schema("api")
    .rpc("assign_camera_meetup_places", {
      p_camera_id: camera.data,
      p_place_ids: ids.data,
    });
  if (error)
    return {
      status: "error",
      message: "Places changed or could not be saved. Reload and retry.",
    };
  revalidatePath(`/admin/cameras/${camera.data}`);
  revalidatePath("/checkout");
  return {
    status: "success",
    message: ids.data.length
      ? "Meetup choices saved."
      : "No meetup places assigned. New rental requests are unavailable.",
  };
}
export async function searchMeetupPlaces(query: string) {
  const context = await requireAdmin();
  const input = z.string().trim().min(3).max(200).safeParse(query);
  if (!input.success)
    return { error: "Enter at least three characters.", places: [] };
  const config = getMeetupProviderConfig();
  if (!config || !(await claimGeoapifyProviderBudget(context.user.id, 1)))
    return {
      error:
        "Search is unavailable. You can position a public-place pin manually.",
      places: [],
    };
  try {
    const rows = await new GeoapifyAdapter({
      apiKey: config.apiKey,
      timeoutMs: config.timeoutMs,
    }).searchAddressSuggestions(input.data);
    return {
      places: rows.map(({ address, city, latitude, longitude }) => ({
        address,
        city,
        latitude,
        longitude,
      })),
    };
  } catch {
    return {
      error:
        "Search is unavailable. You can position a public-place pin manually.",
      places: [],
    };
  }
}
