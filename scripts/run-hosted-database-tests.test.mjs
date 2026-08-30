import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "..");
const runner = resolve(repositoryRoot, "scripts/run-hosted-database-tests.sh");
const approvedTest = "supabase/tests/hosted/005_verification_policy_disabled.sql";
const developmentProject = "ekmoiepalelqpmemvrkl";
const secret = "sb_secret_do_not_print";

let fixtureRoot;
let fakeBin;
let responseTmp;
let invocationMarker;

function run(overrides = {}, args = ["--target", "development", approvedTest]) {
  return spawnSync("bash", [runner, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      TMPDIR: responseTmp,
      SUPABASE_ACCESS_TOKEN: secret,
      SUPABASE_PROJECT_ID: developmentProject,
      FAKE_CURL_BODY: JSON.stringify([["1..1"], ["ok 1 - safe"]]),
      FAKE_CURL_HTTP_STATUS: "200",
      FAKE_CURL_EXIT: "0",
      FAKE_CURL_MARKER: invocationMarker,
      ...overrides,
    },
  });
}

function output(result) {
  return `${result.stdout}${result.stderr}`;
}

function signalProcessTree(rootPid, signal) {
  const processes = spawnSync("ps", ["-axo", "pid=,ppid="], {
    encoding: "utf8",
  });
  if (processes.status !== 0) {
    throw new Error("unable to inspect hosted runner process tree");
  }

  const childrenByParent = new Map();
  for (const line of processes.stdout.trim().split("\n")) {
    const [pidText, parentPidText] = line.trim().split(/\s+/);
    const pid = Number(pidText);
    const parentPid = Number(parentPidText);
    if (!Number.isInteger(pid) || !Number.isInteger(parentPid)) continue;
    const children = childrenByParent.get(parentPid) ?? [];
    children.push(pid);
    childrenByParent.set(parentPid, children);
  }

  const descendants = [];
  const collect = (parentPid) => {
    for (const childPid of childrenByParent.get(parentPid) ?? []) {
      collect(childPid);
      descendants.push(childPid);
    }
  };
  collect(rootPid);

  for (const pid of [...descendants, rootPid]) {
    try {
      process.kill(pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
}

function waitForPath(path, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      readFileSync(path);
      return;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  throw new Error(`timed out waiting for ${path}`);
}

describe("hosted database test runner diagnostics", { timeout: 15_000 }, () => {
  beforeEach(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "camnook-hosted-runner-test-"));
    fakeBin = join(fixtureRoot, "bin");
    responseTmp = join(fixtureRoot, "responses");
    invocationMarker = join(fixtureRoot, "curl-invoked");
    mkdirSync(fakeBin, { recursive: true });
    mkdirSync(responseTmp, { recursive: true });
    const fakeCurl = join(fakeBin, "curl");
    writeFileSync(
      fakeCurl,
      `#!/usr/bin/env bash
set -euo pipefail
output_file=""
while (( $# > 0 )); do
  if [[ "$1" == "-o" ]]; then
    output_file="$2"
    shift 2
  else
    shift
  fi
done
cat >/dev/null
touch "$FAKE_CURL_MARKER"
if [[ "\${FAKE_CURL_BLOCK:-0}" == "1" ]]; then
  sleep 30
fi
printf '%s' "$FAKE_CURL_BODY" >"$output_file"
printf '%s' "$FAKE_CURL_HTTP_STATUS"
printf '%s' 'raw curl stderr sb_secret_curl_leak' >&2
exit "$FAKE_CURL_EXIT"
`,
    );
    chmodSync(fakeCurl, 0o755);
  });

  afterEach(() => {
    rmSync(fixtureRoot, { force: true, recursive: true });
  });

  it("accepts a passing TAP response and removes temporary files", () => {
    const result = run();

    expect(result.status).toBe(0);
    expect(output(result)).toContain("ok - hosted 005_verification_policy_disabled.sql");
    expect(output(result)).not.toContain("raw curl stderr");
    expect(readdirSync(responseTmp)).toHaveLength(0);
  });

  it("emits only allowlisted duplicate-key diagnostics", () => {
    const body = JSON.stringify({
      code: "23505",
      message: 'duplicate key violates constraint "admin_accounts_pkey"',
      detail:
        "owner@example.com +639171234567 10.31570 123.88540 16000000-0000-4000-8000-000000000001 123 Main Street SELECT * FROM private.admin_accounts",
      hint: `${secret} ${developmentProject} provider:private-token`,
    });
    const result = run({ FAKE_CURL_BODY: body, FAKE_CURL_HTTP_STATUS: "400" });
    const combined = output(result);

    expect(result.status).toBe(1);
    expect(combined).toContain("HTTP 400");
    expect(combined).toContain("sqlstate=23505");
    expect(combined).toContain("category=unique_violation");
    expect(combined).toContain("constraint=admin_accounts_pkey");
    for (const forbidden of [
      secret,
      developmentProject,
      "owner@example.com",
      "+639171234567",
      "10.31570",
      "123.88540",
      "16000000",
      "private-token",
      "123 Main Street",
      "SELECT *",
      "raw curl stderr",
    ]) {
      expect(combined).not.toContain(forbidden);
    }
    expect(readdirSync(responseTmp)).toHaveLength(0);
  });

  it("removes temporary files when the process is interrupted", { timeout: 15_000 }, async () => {
    const child = spawn("bash", [runner, "--target", "development", approvedTest], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        TMPDIR: responseTmp,
        SUPABASE_ACCESS_TOKEN: secret,
        SUPABASE_PROJECT_ID: developmentProject,
        FAKE_CURL_BODY: "{}",
        FAKE_CURL_HTTP_STATUS: "200",
        FAKE_CURL_EXIT: "0",
        FAKE_CURL_MARKER: invocationMarker,
        FAKE_CURL_BLOCK: "1",
      },
      stdio: "ignore",
    });
    const closed = new Promise((resolvePromise) => {
      child.once("close", (code, signal) => resolvePromise({ code, signal }));
    });

    try {
      waitForPath(invocationMarker);
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(
          `runner exited before curl started (code=${child.exitCode}, signal=${child.signalCode})`,
        );
      }
      signalProcessTree(child.pid, "SIGTERM");
      await closed;
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        signalProcessTree(child.pid, "SIGKILL");
        await closed;
      }
    }

    expect(readdirSync(responseTmp)).toHaveLength(0);
  });

  it.each([
    ["malformed body", { FAKE_CURL_BODY: "not-json" }, "invalid_success_response"],
    [
      "a failing assertion",
      { FAKE_CURL_BODY: JSON.stringify([["ok 1 - safe"], ["not ok 2 - private"]]) },
      "tap_assertion_failure",
    ],
  ])("fails safely for %s", (_name, overrides, category) => {
    const result = run(overrides);

    expect(result.status).toBe(1);
    expect(output(result)).toContain(`category=${category}`);
    expect(output(result)).not.toContain("private");
    expect(readdirSync(responseTmp)).toHaveLength(0);
  });

  it.each([
    ["transport failure", { FAKE_CURL_EXIT: "28", FAKE_CURL_HTTP_STATUS: "000" }, "transport_error"],
    ["remote service failure", { FAKE_CURL_HTTP_STATUS: "503" }, "remote_service_error"],
  ])("marks %s indeterminate and requires reconciliation", (_name, overrides, category) => {
    const result = run(overrides);
    const combined = output(result);

    expect(result.status).toBe(1);
    expect(combined).toContain("outcome=indeterminate");
    expect(combined).toContain(`category=${category}`);
    expect(combined).toContain("reconcile_before_retry=true");
    expect(combined).not.toContain("raw curl stderr");
    expect(readFileSync(invocationMarker, "utf8")).toBe("");
    expect(readdirSync(responseTmp)).toHaveLength(0);
  });

  it.each([
    [
      "a target/project mismatch",
      { SUPABASE_PROJECT_ID: "iegcixcevvkryfwfotqz" },
      ["--target", "development", approvedTest],
    ],
    [
      "an unapproved SQL path",
      {},
      ["--target", "development", "supabase/tests/database/013_return_confirmation.sql"],
    ],
  ])("aborts before network access for %s", (_name, overrides, args) => {
    const result = run(overrides, args);

    expect(result.status).toBe(2);
    expect(() => readFileSync(invocationMarker)).toThrow();
    expect(output(result)).not.toContain(secret);
    expect(readdirSync(responseTmp)).toHaveLength(0);
  });
});
