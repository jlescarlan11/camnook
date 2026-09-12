import "server-only";

import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import type { Database } from "@/types/database.generated";

const SMOKE_EMAIL = "residential-release-smoke@camnook.invalid";
const fixture = {
  address_details: "Synthetic public fixture",
  area_code: "0730600041",
  birth_date: "1990-03-15",
  building: "Release Automation",
  house_number: "12",
  legacy_address_line1: null,
  legal_name: "CamNook Release Smoke",
  phone: "+639000000000",
  postal_code: "6000",
  release_key: "2026-q2",
  street_name: "Mango Avenue",
};

type SmokeProfile = {
  address_details?: unknown;
  address_revision?: unknown;
  area_code?: unknown;
  building?: unknown;
  house_number?: unknown;
  postal_code?: unknown;
  release?: unknown;
  residential_pin?: null | { source?: unknown };
  street_name?: unknown;
};

function assertProfile(value: unknown, expectedPin: boolean) {
  const profile = value as SmokeProfile | null;
  if (
    !profile || profile.address_details !== fixture.address_details ||
    profile.area_code !== fixture.area_code || profile.building !== fixture.building ||
    profile.house_number !== fixture.house_number || profile.postal_code !== fixture.postal_code ||
    profile.release !== fixture.release_key || profile.street_name !== fixture.street_name ||
    typeof profile.address_revision !== "string" ||
    (expectedPin ? profile.residential_pin?.source !== "map_pin" : profile.residential_pin !== null)
  ) throw new Error("Residential Production smoke returned an unexpected projection");
  return profile;
}

async function findSmokeUser(admin: ReturnType<typeof createSupabaseAdminClient>) {
  for (let page = 1; page <= 20; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw new Error("Residential Production smoke user lookup failed");
    const user = result.data.users.find((candidate) => candidate.email === SMOKE_EMAIL);
    if (user) return user;
    if (result.data.users.length < 1000) break;
  }
  return null;
}

export async function runResidentialProductionSmoke({
  createActorClient = () => {
    const { publishableKey, url } = getSupabasePublicConfig();
    return createClient<Database>(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  },
  createAdminClient = createSupabaseAdminClient,
} = {}) {
  const admin = createAdminClient();
  const ephemeralCredential = `Cn-${randomBytes(32).toString("base64url")}`;
  const created = await admin.auth.admin.createUser({
    email: SMOKE_EMAIL,
    email_confirm: true,
    password: ephemeralCredential,
  });
  let user = created.data.user;
  if (created.error) {
    user = await findSmokeUser(admin);
    if (!user) throw new Error("Residential Production smoke user provisioning failed");
    const updated = await admin.auth.admin.updateUserById(user.id, {
      email_confirm: true,
      password: ephemeralCredential,
    });
    if (updated.error) throw new Error("Residential Production smoke user provisioning failed");
  }

  const actor = createActorClient();
  // Issue a token only for the fixed synthetic actor; no email is sent.
  // Password sign-in requires a human CAPTCHA in Production.
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: SMOKE_EMAIL });
  if (link.error || link.data.user?.id !== user?.id || !link.data.properties?.hashed_token) {
    throw new Error("Residential Production smoke token generation failed");
  }
  const signIn = await actor.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: "email",
  });
  if (signIn.error || !signIn.data.user || signIn.data.user.id !== user?.id) {
    throw new Error("Residential Production smoke authentication failed");
  }
  const rpc = async (name: "get_my_kyc_profile_v2" | "save_my_kyc_profile_v2", p_input?: Database["api"]["Functions"]["save_my_kyc_profile_v2"]["Args"]["p_input"]) => {
    const result = name === "get_my_kyc_profile_v2"
      ? await actor.schema("api").rpc(name)
      : await actor.schema("api").rpc(name, { p_input: p_input! });
    if (result.error) throw new Error(`Residential Production smoke ${name} failed`);
    return result.data;
  };

  let latestRevision: string | null = null;
  let pinWasSet = false;
  try {
    const existing = await rpc("get_my_kyc_profile_v2") as SmokeProfile | null;
    const saved = assertProfile(await rpc("save_my_kyc_profile_v2", {
      ...fixture,
      expected_address_revision: typeof existing?.address_revision === "string"
        ? existing.address_revision
        : null,
      pin_accuracy_meters: null, pin_consent_version: "residential-pin-v1",
      pin_latitude: "10.31570", pin_longitude: "123.88540",
      pin_operation: "set", pin_source: "map_pin",
    }), true);
    pinWasSet = true;
    latestRevision = saved.address_revision as string;
    assertProfile(await rpc("get_my_kyc_profile_v2"), true);
    assertProfile(await rpc("save_my_kyc_profile_v2", {
      ...fixture, expected_address_revision: latestRevision,
      pin_accuracy_meters: null, pin_consent_version: null,
      pin_latitude: null, pin_longitude: null, pin_operation: "remove", pin_source: null,
    }), false);
    pinWasSet = false;
    assertProfile(await rpc("get_my_kyc_profile_v2"), false);
  } finally {
    if (pinWasSet && latestRevision) {
      await actor.schema("api").rpc("save_my_kyc_profile_v2", { p_input: {
        ...fixture, expected_address_revision: latestRevision,
        pin_accuracy_meters: null, pin_consent_version: null,
        pin_latitude: null, pin_longitude: null, pin_operation: "remove", pin_source: null,
      } });
    }
    await actor.auth.signOut();
  }
}
