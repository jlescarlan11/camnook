import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { addressReferenceSchema, psgcChoicesSchema } from "@/features/locations/types";

const querySchema = z.object({
  parent: z.string().regex(/^\d{10}$/).nullable(),
});

export async function GET(request: Request) {
  let context: Awaited<ReturnType<typeof requireUser>>;
  try {
    context = await requireUser();
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  if (url.searchParams.has("view")) {
    if (url.searchParams.get("view") !== "address-reference" || url.searchParams.has("parent")) {
      return Response.json({ error: "invalid_query" }, { status: 400 });
    }
    const result = await context.supabase.schema("api").rpc("list_psgc_address_reference");
    const parsed = addressReferenceSchema.safeParse(result.data);
    if (result.error || !parsed.success) return Response.json({ error: "reference_unavailable" }, { status: 503 });
    return Response.json(parsed.data, { headers: { "Cache-Control": "private, max-age=300" } });
  }
  const query = querySchema.safeParse({ parent: url.searchParams.get("parent") });
  if (!query.success) {
    return Response.json({ error: "invalid_parent" }, { status: 400 });
  }

  const result = await context.supabase.schema("api").rpc("list_psgc_area_choices", {
    p_parent_code: query.data.parent ?? undefined,
  });
  const parsed = psgcChoicesSchema.safeParse(result.data);
  if (result.error || !parsed.success) {
    return Response.json({ error: "reference_unavailable" }, { status: 503 });
  }

  return Response.json(parsed.data, {
    headers: { "Cache-Control": "private, max-age=3600" },
  });
}
