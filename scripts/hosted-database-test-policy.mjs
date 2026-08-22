import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const defaultRepositoryRoot = resolve(scriptDirectory, "..");
export const defaultManifestPath = resolve(
  defaultRepositoryRoot,
  "supabase/tests/hosted/manifest.json",
);
export const allowedTargets = new Set(["development", "production"]);

function fail(message) {
  throw new Error(message);
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ");
}

function normalizeSql(sql) {
  return stripSqlComments(sql).replace(/\s+/g, " ").trim();
}

function isInside(root, target) {
  const pathFromRoot = relative(root, target);
  return (
    pathFromRoot !== "" &&
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !pathFromRoot.startsWith(sep)
  );
}

export function validateHostedSql(sql, displayPath = "hosted SQL") {
  const normalized = normalizeSql(sql);
  const lower = normalized.toLowerCase();

  if (!/^begin\s*;/.test(lower)) {
    fail(`${displayPath}: hosted SQL must start with BEGIN`);
  }
  if (!/rollback\s*;$/.test(lower)) {
    fail(`${displayPath}: hosted SQL must end with ROLLBACK`);
  }
  if (/\bcommit\s*;/.test(lower)) {
    fail(`${displayPath}: COMMIT is forbidden in hosted SQL`);
  }
  if (/\btruncate\b/.test(lower)) {
    fail(`${displayPath}: TRUNCATE is forbidden in hosted SQL`);
  }
  if (/\bdelete\s+from\b/.test(lower)) {
    fail(`${displayPath}: DELETE is forbidden in hosted SQL`);
  }
  if (/\b(drop|alter)\s+(table|schema|database|role)\b/.test(lower)) {
    fail(`${displayPath}: destructive DDL is forbidden in hosted SQL`);
  }
  if (
    /\b(insert\s+into|update|delete\s+from|merge\s+into|copy)\s+(?:only\s+)?(?:"?private"?)\s*\.\s*(?:"?admin_accounts"?)\b/.test(
      lower,
    )
  ) {
    fail(`${displayPath}: direct admin_accounts mutation is forbidden`);
  }

  const updateStatements = lower.match(/\bupdate\b[\s\S]*?;/g) ?? [];
  for (const statement of updateStatements) {
    if (!/\bwhere\b/.test(statement)) {
      fail(`${displayPath}: UPDATE without WHERE is forbidden in hosted SQL`);
    }
  }

  return true;
}

export function loadHostedManifest({
  repositoryRoot = defaultRepositoryRoot,
  manifestPath = resolve(repositoryRoot, "supabase/tests/hosted/manifest.json"),
} = {}) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    fail("hosted test manifest is missing or invalid JSON");
  }

  if (manifest?.version !== 1 || !Array.isArray(manifest.tests)) {
    fail("hosted test manifest must use version 1 with a tests array");
  }

  const hostedRoot = resolve(repositoryRoot, "supabase/tests/hosted");
  const canonicalHostedRoot = realpathSync(hostedRoot);
  const seen = new Set();
  const tests = manifest.tests.map((entry, index) => {
    if (
      !entry ||
      typeof entry.path !== "string" ||
      !Array.isArray(entry.targets) ||
      entry.targets.length === 0
    ) {
      fail(`hosted test manifest entry ${index + 1} is invalid`);
    }
    if (seen.has(entry.path)) {
      fail(`hosted test manifest contains duplicate path: ${entry.path}`);
    }
    seen.add(entry.path);
    if (
      entry.targets.some(
        (target) => typeof target !== "string" || !allowedTargets.has(target),
      ) ||
      new Set(entry.targets).size !== entry.targets.length
    ) {
      fail(`hosted test manifest has invalid targets for ${entry.path}`);
    }
    if (!/^supabase\/tests\/hosted\/[a-z0-9_]+\.sql$/.test(entry.path)) {
      fail(`hosted test path is outside the approved suite: ${entry.path}`);
    }

    const absolutePath = resolve(repositoryRoot, entry.path);
    if (!existsSync(absolutePath)) {
      fail(`hosted test file is missing: ${entry.path}`);
    }
    if (lstatSync(absolutePath).isSymbolicLink()) {
      fail(`hosted test path must not be a symbolic link: ${entry.path}`);
    }
    if (!lstatSync(absolutePath).isFile()) {
      fail(`hosted test path is not a file: ${entry.path}`);
    }
    const canonicalPath = realpathSync(absolutePath);
    if (!isInside(canonicalHostedRoot, canonicalPath)) {
      fail(`hosted test path escapes the approved suite: ${entry.path}`);
    }
    validateHostedSql(readFileSync(canonicalPath, "utf8"), entry.path);

    return Object.freeze({
      path: entry.path,
      targets: Object.freeze([...entry.targets]),
    });
  });

  if (tests.length === 0) {
    fail("hosted test manifest must not be empty");
  }
  return Object.freeze(tests);
}

export function selectHostedTests(target, options) {
  if (!allowedTargets.has(target)) {
    fail(`invalid hosted test target: ${target}`);
  }
  return loadHostedManifest(options)
    .filter((entry) => entry.targets.includes(target))
    .map((entry) => entry.path);
}

export function assertAllowedHostedTests(target, requestedPaths, options) {
  const allowed = new Set(selectHostedTests(target, options));
  if (!Array.isArray(requestedPaths) || requestedPaths.length === 0) {
    fail("provide at least one hosted SQL test file");
  }
  if (new Set(requestedPaths).size !== requestedPaths.length) {
    fail("hosted SQL test files must not be repeated");
  }
  for (const requestedPath of requestedPaths) {
    if (!allowed.has(requestedPath)) {
      fail(`refusing unapproved hosted test path: ${requestedPath}`);
    }
  }
  return requestedPaths;
}

function runCli() {
  const [command, target, ...requestedPaths] = process.argv.slice(2);
  if (command === "validate-manifest" && target === undefined) {
    loadHostedManifest();
    return;
  }
  if (command === "list" && target !== undefined) {
    process.stdout.write(`${selectHostedTests(target).join("\n")}\n`);
    return;
  }
  if (command === "assert-allowed" && target !== undefined) {
    assertAllowedHostedTests(target, requestedPaths);
    return;
  }
  fail(
    "usage: hosted-database-test-policy.mjs validate-manifest | list <target> | assert-allowed <target> <paths...>",
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "hosted test policy failed"}\n`);
    process.exitCode = 2;
  }
}
