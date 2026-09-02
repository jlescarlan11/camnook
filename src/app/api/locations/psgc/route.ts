import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { psgcChoicesSchema } from "@/features/locations/types";

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
  const query = querySchema.safeParse({ parent: url.searchParams.get("parent") });
  if (!query.success) {
    return Response.json({ error: "invalid_parent" }, { status: 400 });
  }

  const result = await context.supabase.schema("api").rpc("list_psgc_area_choices", {
    p_parent_code: query.data.parent,
  });
  const parsed = psgcChoicesSchema.safeParse(result.data);
  if (result.error || !parsed.success) {
    return Response.json({ error: "reference_unavailable" }, { status: 503 });
  }

  return Response.json(parsed.data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
