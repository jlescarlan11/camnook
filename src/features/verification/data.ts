import "server-only";

import type { requireUser } from "@/lib/auth/require-user";

import { verificationStateSchema } from "./types";

type UserContext = Awaited<ReturnType<typeof requireUser>>;

export async function loadVerificationState(context: UserContext) {
  const { data, error } = await context.supabase
    .schema("api")
    .rpc("get_my_verification_upload_state");
  const parsed = verificationStateSchema.safeParse(data);

  if (error || !parsed.success) {
    return { status: "error" } as const;
  }

  return { state: parsed.data, status: "success" } as const;
}
