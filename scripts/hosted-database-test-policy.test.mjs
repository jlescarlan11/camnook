import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertAllowedHostedTests,
  loadHostedManifest,
  selectHostedTests,
  validateHostedSql,
} from "./hosted-database-test-policy.mjs";

const temporaryDirectories = [];

function makeRepository(entries) {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "camnook-hosted-policy-"));
  temporaryDirectories.push(repositoryRoot);
  const hostedRoot = join(repositoryRoot, "supabase/tests/hosted");
  mkdirSync(hostedRoot, { recursive: true });
  for (const [name, sql] of Object.entries(entries)) {
    writeFileSync(join(hostedRoot, name), sql);
  }
  writeFileSync(
    join(hostedRoot, "manifest.json"),
    JSON.stringify({
      version: 1,
      tests: Object.keys(entries).map((name) => ({
        path: `supabase/tests/hosted/${name}`,
        targets: ["development"],
      })),
    }),
  );
  return repositoryRoot;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe("hosted database test policy", () => {
  it("loads one reviewed manifest and selects target-specific tests", () => {
    const tests = loadHostedManifest();
    expect(tests.map(({ path }) => path)).toEqual([
      "supabase/tests/hosted/005_verification_policy_disabled.sql",
      "supabase/tests/hosted/006_verification_rls.sql",
      "supabase/tests/hosted/010_calendar_handoff_meetup.sql",
    ]);
    expect(selectHostedTests("production")).toEqual([
      "supabase/tests/hosted/005_verification_policy_disabled.sql",
    ]);
  });

  it.each([
    ["missing BEGIN", "select 'ok 1'; rollback;", "must start with BEGIN"],
    ["missing ROLLBACK", "begin; select 'ok 1';", "must end with ROLLBACK"],
    ["COMMIT", "begin; select 'ok 1'; commit; rollback;", "COMMIT is forbidden"],
    ["TRUNCATE", "begin; truncate public.cameras; rollback;", "TRUNCATE is forbidden"],
    ["DELETE", "begin; delete from public.cameras where false; rollback;", "DELETE is forbidden"],
    [
      "admin insert",
      "begin; insert into private.admin_accounts (user_id) values (gen_random_uuid()); rollback;",
      "admin_accounts mutation is forbidden",
    ],
    [
      "admin update",
      "begin; update private.admin_accounts set singleton = true where singleton; rollback;",
      "admin_accounts mutation is forbidden",
    ],
    [
      "admin merge",
      "begin; merge into private.admin_accounts as target using (select gen_random_uuid() as user_id) as source on false when not matched then insert (user_id) values (source.user_id); rollback;",
      "admin_accounts mutation is forbidden",
    ],
    ["unscoped update", "begin; update public.cameras set name = 'x'; rollback;", "UPDATE without WHERE"],
  ])("rejects %s", (_name, sql, message) => {
    expect(() => validateHostedSql(sql, "fixture.sql")).toThrow(message);
  });

  it("allows bounded transaction-local updates", () => {
    expect(
      validateHostedSql(
        "begin; update private.verification_evidence_policies set enabled = false where singleton; select 'ok 1'; rollback;",
      ),
    ).toBe(true);
  });

  it("rejects duplicate, escaped, missing, and symlinked manifest paths", () => {
    const repositoryRoot = makeRepository({
      "safe.sql": "begin; select 'ok 1'; rollback;",
    });
    const manifestPath = join(repositoryRoot, "supabase/tests/hosted/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.tests.push(manifest.tests[0]);
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => loadHostedManifest({ repositoryRoot })).toThrow("duplicate path");

    writeFileSync(
      manifestPath,
      JSON.stringify({
        version: 1,
        tests: [{ path: "supabase/tests/database/outside.sql", targets: ["development"] }],
      }),
    );
    expect(() => loadHostedManifest({ repositoryRoot })).toThrow("outside the approved suite");

    writeFileSync(
      manifestPath,
      JSON.stringify({
        version: 1,
        tests: [{ path: "supabase/tests/hosted/missing.sql", targets: ["development"] }],
      }),
    );
    expect(() => loadHostedManifest({ repositoryRoot })).toThrow("file is missing");

    const outside = join(repositoryRoot, "outside.sql");
    writeFileSync(outside, "begin; select 'ok 1'; rollback;");
    symlinkSync(outside, join(repositoryRoot, "supabase/tests/hosted/link.sql"));
    writeFileSync(
      manifestPath,
      JSON.stringify({
        version: 1,
        tests: [{ path: "supabase/tests/hosted/link.sql", targets: ["development"] }],
      }),
    );
    expect(() => loadHostedManifest({ repositoryRoot })).toThrow("must not be a symbolic link");
  });

  it("rejects invalid targets and unapproved requested files", () => {
    expect(() => selectHostedTests("staging")).toThrow("invalid hosted test target");
    expect(() =>
      assertAllowedHostedTests("development", [
        "supabase/tests/database/013_camera_handoff_policies.sql",
      ]),
    ).toThrow("refusing unapproved hosted test path");
    expect(() =>
      assertAllowedHostedTests("development", [
        "supabase/tests/hosted/005_verification_policy_disabled.sql",
        "supabase/tests/hosted/005_verification_policy_disabled.sql",
      ]),
    ).toThrow("must not be repeated");
  });
});
