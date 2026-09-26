import "server-only";

import type { requireUser } from "@/lib/auth/require-user";
import { kycProfileSchema, projectKycProfile, type KycProfile } from "@/features/kyc/types";
import { projectProfile, safeProfileSchema, type RenterContactProfile } from "../profile";

export type ProfilePageResult =
  | { status: "error"; isAdmin: boolean }
  | { status: "success"; isAdmin: boolean; profile: RenterContactProfile | null; kycProfile: KycProfile | null };

export async function loadProfilePage(
  context: Awaited<ReturnType<typeof requireUser>>,
): Promise<ProfilePageResult> {
  const [profileResult, kycResult, adminResult] = await Promise.allSettled([
    context.supabase.schema("public").from("profiles")
      .select("account_status, legal_name, phone")
      .eq("user_id", context.user.id)
      .maybeSingle(),
    context.supabase.schema("api").rpc("get_my_kyc_profile_v2"),
    context.supabase.schema("api").rpc("is_admin"),
  ]);
  const isAdmin = adminResult.status === "fulfilled"
    && !adminResult.value.error && adminResult.value.data === true;
  if (profileResult.status === "rejected" || kycResult.status === "rejected"
    || profileResult.value.error || kycResult.value.error) {
    return { status: "error", isAdmin };
  }
  const profile = safeProfileSchema.nullable().safeParse(profileResult.value.data);
  const kyc = kycProfileSchema.safeParse(kycResult.value.data);
  if (!profile.success || !kyc.success) return { status: "error", isAdmin };
  return {
    status: "success",
    isAdmin,
    profile: profile.data ? projectProfile(profile.data) : null,
    kycProfile: kyc.data ? projectKycProfile(kyc.data) : null,
  };
}
