// Creates a real, short-lived Supabase session for an existing Development user.
// No application authentication code is modified and no email is sent.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { createRequire } from "node:module";
import { assertDevelopment, developmentUrl } from "./local-development.mjs";
const require = createRequire(import.meta.url);
createRequire(require.resolve("next/package.json"))("@next/env").loadEnvConfig(
  process.cwd(),
  true,
);
assertDevelopment(process.env);
const userId = process.argv[2];
if (!/^[0-9a-f-]{36}$/.test(userId ?? ""))
  throw new Error("Pass an existing Development user UUID.");
const admin = createClient(
  developmentUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data, error } = await admin.auth.admin.getUserById(userId);
if (error || !data.user?.email) throw new Error("Development user not found.");
const link = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: data.user.email,
});
if (link.error) throw new Error("Could not create Development sign-in.");
const tokenHash = link.data.properties.hashed_token;
const path = "/" + randomBytes(24).toString("hex");
let consumed = false;
const server = createServer(async (req, res) => {
  if (req.url !== path || req.method !== "GET" || consumed) {
    res.writeHead(404).end();
    return;
  }
  consumed = true;
  const cookieHeaders = [];
  const client = createServerClient(
    developmentUrl,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => [],
        setAll: (values) => {
          for (const { name, value, options } of values)
            cookieHeaders.push(
              `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax${options.maxAge !== undefined ? "; Max-Age=" + options.maxAge : ""}`,
            );
        },
      },
    },
  );
  try {
    const verified = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });
    if (verified.error) throw new Error("verification failed");
    res
      .writeHead(302, {
        "Set-Cookie": cookieHeaders,
        Location: "http://127.0.0.1:3000/",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      })
      .end();
    console.log("Real Development session established.");
  } catch {
    res.writeHead(500).end("Development sign-in failed.");
  } finally {
    server.close();
  }
});
server.listen(3001, "127.0.0.1", () => {
  mkdirSync(".vercel/local-development", { recursive: true, mode: 0o700 });
  writeFileSync(
    ".vercel/local-development/session-url",
    `http://127.0.0.1:3001${path}`,
    { mode: 0o600 },
  );
  console.log(
    "One-use Development sign-in ready; local URL saved in .vercel/local-development/session-url (expires in 2 minutes).",
  );
});
setTimeout(() => server.close(), 120000).unref();
