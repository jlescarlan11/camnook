import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { assertDevelopment, developmentUrl } from "./local-development.mjs";
const require = createRequire(import.meta.url);
createRequire(require.resolve("next/package.json"))("@next/env").loadEnvConfig(
  process.cwd(),
  true,
);
assertDevelopment(process.env);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(
  developmentUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  options,
);
const email = "meetup-local-test@camnook.example";
let user;
for (let page = 1; ; page++) {
  const result = await admin.auth.admin.listUsers({ page, perPage: 100 });
  if (result.error) throw new Error("Development user lookup failed.");
  user = result.data.users.find((candidate) => candidate.email === email);
  if (user || result.data.users.length < 100) break;
}
if (!user) {
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { purpose: "local-meetup-verification" },
  });
  if (created.error)
    throw new Error("Development fixture user creation failed.");
  user = created.data.user;
}
if (user.user_metadata.purpose !== "local-meetup-verification")
  throw new Error("Refusing to modify an account not owned by this fixture.");
const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (link.error) throw new Error("Development fixture sign-in failed.");
const renter = createClient(
  developmentUrl,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  options,
);
const session = await renter.auth.verifyOtp({
  token_hash: link.data.properties.hashed_token,
  type: "magiclink",
});
if (session.error) throw new Error("Development fixture session failed.");
const saved = await renter.schema("api").rpc("save_my_kyc_profile", {
  p_input: {
    legal_name: "Development Meetup Renter",
    phone: "+639800000099",
    birth_date: "1990-01-01",
    address_line1: "Development fixture — Unit 4, 123 Mango Avenue",
    release_key: "2026-q2",
    area_code: "0730600041",
  },
});
if (saved.error)
  throw new Error("Development fixture profile failed: " + saved.error.code);
await renter.auth.signOut();
mkdirSync(".vercel/local-development", { recursive: true, mode: 0o700 });
writeFileSync(
  ".vercel/local-development/renter.json",
  JSON.stringify({ id: user.id, email }) + "\n",
  { mode: 0o600 },
);
console.log(
  "Reusable synthetic Development renter ready. UUID saved in .vercel/local-development/renter.json.",
);
