import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sqlStateCategories = new Map([
  ["22023", "invalid_parameter"],
  ["23503", "foreign_key_violation"],
  ["23505", "unique_violation"],
  ["23514", "check_violation"],
  ["23P01", "exclusion_violation"],
  ["40001", "serialization_failure"],
  ["42501", "insufficient_privilege"],
  ["42601", "syntax_error"],
  ["42P01", "undefined_table"],
]);

const safeConstraintPattern = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const sqlStatePattern = /^[0-9A-Z]{5}$/;

function flattenValues(value, values = []) {
  if (typeof value === "string") {
    values.push(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) flattenValues(entry, values);
  } else if (value && typeof value === "object") {
    for (const entry of Object.values(value)) flattenValues(entry, values);
  }
  return values;
}

function collectNamedValues(value, names, matches = []) {
  if (Array.isArray(value)) {
    for (const entry of value) collectNamedValues(entry, names, matches);
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (names.has(key.toLowerCase()) && typeof entry === "string") {
        matches.push(entry);
      }
      collectNamedValues(entry, names, matches);
    }
  }
  return matches;
}

function parseJson(body) {
  try {
    return { parsed: JSON.parse(body), valid: true };
  } catch {
    return { parsed: null, valid: false };
  }
}

function extractSqlState(parsed) {
  for (const value of collectNamedValues(parsed, new Set(["code", "sqlstate"]))) {
    const candidate = value.toUpperCase();
    if (sqlStatePattern.test(candidate)) return candidate;
  }
  for (const value of flattenValues(parsed)) {
    const match = value.toUpperCase().match(
      /(?:SQLSTATE\s*[:=]?\s*|ERROR:\s*)([0-9A-Z]{5})\b/,
    );
    if (match) return match[1];
  }
  return null;
}

function extractConstraint(parsed) {
  for (const value of collectNamedValues(parsed, new Set(["constraint"]))) {
    if (safeConstraintPattern.test(value)) return value;
  }
  for (const value of flattenValues(parsed)) {
    const match = value.match(/constraint\s+["']([A-Za-z_][A-Za-z0-9_]{0,127})["']/i);
    if (match && safeConstraintPattern.test(match[1])) return match[1];
  }
  return null;
}

function hasHint(parsed) {
  return collectNamedValues(parsed, new Set(["hint"])).some(
    (value) => value.trim() !== "",
  );
}

function inferMessageCategory(parsed) {
  const combined = flattenValues(parsed).join(" ").toLowerCase();
  if (/duplicate key|unique constraint/.test(combined)) return "unique_violation";
  if (/permission denied|insufficient privilege/.test(combined)) {
    return "insufficient_privilege";
  }
  if (/syntax error/.test(combined)) return "syntax_error";
  return null;
}

export function sanitizeDiagnosticText(value) {
  return String(value)
    .replace(/authorization\s*:\s*bearer\s+\S+/gi, "[redacted-authorization]")
    .replace(/\bbearer\s+\S+/gi, "[redacted-authorization]")
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9._-]+\b/gi, "[redacted-token]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-jwt]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[redacted-uuid]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/(?<![A-Za-z0-9])\+?\d[\d ()-]{6,}\d(?![A-Za-z0-9])/g, "[redacted-phone]")
    .replace(/(?<![A-Za-z0-9])-?\d{1,3}\.\d{3,}(?![A-Za-z0-9])/g, "[redacted-coordinate]")
    .replace(/\b(?:provider|geoapify)[_:=-][A-Za-z0-9._:-]+\b/gi, "[redacted-provider]")
    .replace(/\b[a-z]{20}\b/g, "[redacted-project-ref]")
    .slice(0, 240);
}

export function renderHttpFailure(httpStatus, body) {
  const status = String(httpStatus);
  const numericStatus = /^\d{3}$/.test(status) ? Number(status) : 0;
  const { parsed, valid } = parseJson(body);
  const sqlState = valid ? extractSqlState(parsed) : null;
  const constraint = valid ? extractConstraint(parsed) : null;
  const category =
    (sqlState && sqlStateCategories.get(sqlState)) ||
    (valid && inferMessageCategory(parsed)) ||
    (numericStatus === 401 || numericStatus === 403
      ? "authorization_failed"
      : numericStatus === 404
        ? "target_not_found"
        : numericStatus === 429
          ? "rate_limited"
          : numericStatus >= 500 || numericStatus === 0
            ? "remote_service_error"
            : valid
              ? "request_rejected"
              : "unrecognized_error_response");
  const indeterminate =
    numericStatus === 0 || numericStatus === 408 || numericStatus === 429 || numericStatus >= 500;
  const fields = [
    `HTTP ${numericStatus || "unknown"}`,
    `outcome=${indeterminate ? "indeterminate" : "deterministic"}`,
    `category=${category}`,
  ];
  if (sqlState) fields.push(`sqlstate=${sqlState}`);
  if (constraint) fields.push(`constraint=${constraint}`);
  if (valid && hasHint(parsed)) fields.push("hint=available_redacted");
  if (indeterminate) fields.push("reconcile_before_retry=true");
  return fields.join("; ");
}

export function renderTransportFailure(curlStatus) {
  const normalizedStatus = /^\d{1,3}$/.test(String(curlStatus))
    ? String(curlStatus)
    : "unknown";
  return [
    "HTTP unknown",
    "outcome=indeterminate",
    "category=transport_error",
    `transport_status=${normalizedStatus}`,
    "reconcile_before_retry=true",
  ].join("; ");
}

export function validateSuccessBody(body) {
  const { parsed, valid } = parseJson(body);
  if (!valid || !Array.isArray(parsed)) {
    return {
      ok: false,
      diagnostic: "outcome=deterministic; category=invalid_success_response",
    };
  }

  const tapLines = flattenValues(parsed).map((value) => value.trim());
  const plans = tapLines
    .map((value) => value.match(/^1\.\.(\d+)$/))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  const passingNumbers = tapLines
    .map((value) => value.match(/^ok\s+(\d+)(?:\s+-\s+.*)?$/i))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  const failing = tapLines.filter((value) => /^not ok\b/i.test(value)).length;
  const planIsValid =
    plans.length === 1 &&
    Number.isSafeInteger(plans[0]) &&
    plans[0] > 0 &&
    plans[0] <= 100;
  const planned = planIsValid ? plans[0] : 0;
  const expectedNumbers = Array.from({ length: planned }, (_, index) => index + 1);
  const complete =
    planIsValid &&
    passingNumbers.length === planned &&
    new Set(passingNumbers).size === planned &&
    expectedNumbers.every((number) => passingNumbers.includes(number));
  if (!complete || failing > 0) {
    return {
      ok: false,
      diagnostic: `outcome=deterministic; category=tap_assertion_failure; planned=${planned}; ok=${passingNumbers.length}; not_ok=${failing}`,
    };
  }
  return { ok: true, passing: passingNumbers.length };
}

function readBody(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function runCli() {
  const [command, value, responsePath] = process.argv.slice(2);
  if (command === "http-failure" && responsePath) {
    process.stdout.write(`${renderHttpFailure(value, readBody(responsePath))}\n`);
    return;
  }
  if (command === "transport-failure" && value) {
    process.stdout.write(`${renderTransportFailure(value)}\n`);
    return;
  }
  if (command === "validate-success" && value) {
    const result = validateSuccessBody(readBody(value));
    if (!result.ok) {
      process.stdout.write(`${result.diagnostic}\n`);
      process.exitCode = 1;
    }
    return;
  }
  throw new Error(
    "usage: hosted-database-test-response.mjs http-failure <status> <file> | transport-failure <curl-status> | validate-success <file>",
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch {
    process.stderr.write("hosted database response parser failed safely\n");
    process.exitCode = 2;
  }
}
