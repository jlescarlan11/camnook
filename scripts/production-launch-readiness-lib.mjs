export const PRODUCTION_PROJECT_REF = "iegcixcevvkryfwfotqz";
export const PRODUCTION_APPLICATION_URL = "https://camnook.shop";
export const EVIDENCE_SCHEMA_VERSION = 3;

export const REQUIRED_SIGNOFFS = [
  "contract_legal",
  "legal_privacy",
  "operations",
  "release_owner",
  "security_recovery",
  "tax_business",
];

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const MIGRATION_PATTERN = /^\d{14}_[a-z0-9_]+\.sql$/;
const DEPLOYMENT_PATTERN = /^dpl_[A-Za-z0-9]+$/;
const SIGNOFF_STATES = new Set(["APPROVED", "MISSING", "OPEN", "REJECTED"]);
const DECISIONS = new Set(["GO", "NO_GO"]);
const PASS_FAIL = new Set(["PASS", "FAIL"]);
const SIGNAL_STATES = new Set(["PASS", "UNAVAILABLE"]);
const SENSITIVE_KEY_PATTERN =
  /(secret|password|credential|service.?role.?key|access.?token|refresh.?token|captcha.?response|private.?object.?path|otp.?code|renter.?email|renter.?phone)/i;
const SENSITIVE_VALUE_PATTERNS = [
  { label: "email address", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { label: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}\b/ },
  { label: "provider secret", pattern: /\b(?:sb_secret_|sk_live_|whsec_)[A-Za-z0-9_-]+\b/i },
  { label: "precise coordinate pair", pattern: /-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/ },
  { label: "provider identifier", pattern: /\bprovider:[A-Za-z0-9_-]+\b/i },
  { label: "opaque meetup reference", pattern: /\bv1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/ },
  { label: "Geoapify key", pattern: /\bgeoapify(?:[_ -]?api)?[_ -]?key\s*[:=]\s*\S+/i },
  { label: "Philippine phone number", pattern: /(?:\+?63|0)9\d{9}\b/ },
];
const SAFE_PASSWORD_EVIDENCE_KEYS = new Set([
  "leakedPasswordProtectionEnabled",
  "passwordAuthenticationUsedByApplication",
  "passwordMinimumLength",
]);

export class LaunchReadinessError extends Error {
  constructor(message) {
    super(message);
    this.name = "LaunchReadinessError";
  }
}

function fail(message) {
  throw new LaunchReadinessError(message);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, path) {
  if (!isPlainObject(value)) fail(`${path} must be an object.`);
  return value;
}

function requireExactKeys(value, path, keys) {
  const object = requireObject(value, path);
  const actual = Object.keys(object).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${path} must contain exactly: ${expected.join(", ")}.`);
  }
  return object;
}

function requireString(value, path, pattern) {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${path} must be a non-empty string.`);
  }
  if (pattern && !pattern.test(value)) fail(`${path} has an invalid format.`);
  return value;
}

function requireBoolean(value, path) {
  if (typeof value !== "boolean") fail(`${path} must be a boolean.`);
  return value;
}

function requireInteger(value, path, { minimum = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(`${path} must be an integer greater than or equal to ${minimum}.`);
  }
  return value;
}

function requireEnum(value, path, allowed) {
  requireString(value, path);
  if (!allowed.has(value)) fail(`${path} must be one of ${[...allowed].join(", ")}.`);
  return value;
}

function requireStringArray(value, path, { pattern, unique = true } = {}) {
  if (!Array.isArray(value)) fail(`${path} must be an array.`);
  const result = value.map((item, index) =>
    requireString(item, `${path}[${index}]`, pattern),
  );
  if (unique && new Set(result).size !== result.length) {
    fail(`${path} must not contain duplicates.`);
  }
  return result;
}

function assertIsoTimestamp(value, path) {
  requireString(value, path);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) {
    fail(`${path} must be a second-precision UTC timestamp.`);
  }
  if (Number.isNaN(Date.parse(value))) fail(`${path} must be a valid timestamp.`);
}

function scanSensitiveValues(value, path = "evidence") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSensitiveValues(item, `${path}[${index}]`));
    return;
  }

  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (!SAFE_PASSWORD_EVIDENCE_KEYS.has(key) && SENSITIVE_KEY_PATTERN.test(key)) {
        fail(`${path}.${key} is a forbidden sensitive evidence field.`);
      }
      scanSensitiveValues(child, `${path}.${key}`);
    }
    return;
  }

  if (typeof value !== "string") return;
  for (const { label, pattern } of SENSITIVE_VALUE_PATTERNS) {
    if (pattern.test(value)) fail(`${path} appears to contain a ${label}.`);
  }
}

function validateCatalog(catalog) {
  requireExactKeys(catalog, "catalog", [
    "accessoryRecordCount",
    "approvedPhotoCount",
    "approvedSlugs",
    "dailyRatePhp",
    "privateProjectionDenied",
    "publicProjection",
    "publishedBusyPeriodCount",
    "publishedCameraCount",
    "securityDepositPhp",
  ]);
  requireInteger(catalog.publishedCameraCount, "catalog.publishedCameraCount");
  const slugs = requireStringArray(catalog.approvedSlugs, "catalog.approvedSlugs", {
    pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  });
  if (catalog.publishedCameraCount !== slugs.length) {
    fail("catalog.publishedCameraCount must equal catalog.approvedSlugs length.");
  }
  requireInteger(catalog.approvedPhotoCount, "catalog.approvedPhotoCount");
  requireInteger(catalog.accessoryRecordCount, "catalog.accessoryRecordCount");
  requireString(catalog.dailyRatePhp, "catalog.dailyRatePhp", /^\d+\.\d{2}$/);
  requireString(catalog.securityDepositPhp, "catalog.securityDepositPhp", /^\d+\.\d{2}$/);
  requireInteger(catalog.publishedBusyPeriodCount, "catalog.publishedBusyPeriodCount");
  requireEnum(catalog.publicProjection, "catalog.publicProjection", PASS_FAIL);
  requireEnum(catalog.privateProjectionDenied, "catalog.privateProjectionDenied", PASS_FAIL);
}

function validateAuth(auth) {
  requireExactKeys(auth, "auth", [
    "adminRecordCount",
    "applicationSiteKeyConfigured",
    "canonicalAdminRecord",
    "captchaProvider",
    "customSmtpEnabled",
    "emailConfirmationEnabled",
    "emailSendLimitPerHour",
    "existingAdminSignIn",
    "existingRenterContinuity",
    "hostedCaptchaEnabled",
    "leakedPasswordProtectionEnabled",
    "otpDigits",
    "otpExpirySeconds",
    "passwordAuthenticationUsedByApplication",
    "passwordMinimumLength",
    "protectedRouteAuthorization",
    "signupEnabled",
    "signupEnabledLastAtActivation",
    "signupSignInLimitPerFiveMinutes",
    "totalIdentityCount",
    "verificationLimitPerFiveMinutes",
  ]);
  requireBoolean(auth.signupEnabled, "auth.signupEnabled");
  requireBoolean(auth.signupEnabledLastAtActivation, "auth.signupEnabledLastAtActivation");
  requireBoolean(auth.hostedCaptchaEnabled, "auth.hostedCaptchaEnabled");
  requireString(auth.captchaProvider, "auth.captchaProvider");
  requireBoolean(auth.applicationSiteKeyConfigured, "auth.applicationSiteKeyConfigured");
  requireBoolean(auth.emailConfirmationEnabled, "auth.emailConfirmationEnabled");
  requireInteger(auth.otpDigits, "auth.otpDigits", { minimum: 1 });
  requireInteger(auth.otpExpirySeconds, "auth.otpExpirySeconds", { minimum: 1 });
  requireBoolean(auth.customSmtpEnabled, "auth.customSmtpEnabled");
  requireBoolean(auth.leakedPasswordProtectionEnabled, "auth.leakedPasswordProtectionEnabled");
  requireBoolean(
    auth.passwordAuthenticationUsedByApplication,
    "auth.passwordAuthenticationUsedByApplication",
  );
  requireInteger(auth.passwordMinimumLength, "auth.passwordMinimumLength", { minimum: 1 });
  requireInteger(auth.emailSendLimitPerHour, "auth.emailSendLimitPerHour", { minimum: 1 });
  requireInteger(auth.verificationLimitPerFiveMinutes, "auth.verificationLimitPerFiveMinutes", {
    minimum: 1,
  });
  requireInteger(auth.signupSignInLimitPerFiveMinutes, "auth.signupSignInLimitPerFiveMinutes", {
    minimum: 1,
  });
  requireEnum(auth.existingAdminSignIn, "auth.existingAdminSignIn", PASS_FAIL);
  requireEnum(auth.existingRenterContinuity, "auth.existingRenterContinuity", PASS_FAIL);
  requireInteger(auth.totalIdentityCount, "auth.totalIdentityCount", { minimum: 1 });
  requireInteger(auth.adminRecordCount, "auth.adminRecordCount", { minimum: 0 });
  requireBoolean(auth.canonicalAdminRecord, "auth.canonicalAdminRecord");
  requireEnum(auth.protectedRouteAuthorization, "auth.protectedRouteAuthorization", PASS_FAIL);
}

function validateMonitoring(monitoring) {
  requireExactKeys(monitoring, "monitoring", [
    "availability",
    "databaseLogWindowMinutes",
    "runtimeWindowHours",
    "signals",
    "thresholds",
  ]);
  const thresholds = requireExactKeys(monitoring.thresholds, "monitoring.thresholds", [
    "authUnexplainedErrorsMax",
    "bookingSmokeFailuresMax",
    "databaseAdvisorErrorsMax",
    "databaseApi5xxMax",
    "runtime5xxMax",
    "runtimeRelevantErrorsMax",
    "smtpUnexplainedFailuresMax",
  ]);
  const signals = requireExactKeys(monitoring.signals, "monitoring.signals", [
    "authUnexplainedErrors",
    "bookingSmokeFailures",
    "databaseAdvisorErrors",
    "databaseApi5xx",
    "runtime5xx",
    "runtimeRelevantErrors",
    "smtpUnexplainedFailures",
  ]);
  const availability = requireExactKeys(monitoring.availability, "monitoring.availability", [
    "auth",
    "booking",
    "database",
    "runtime",
    "smtp",
  ]);
  for (const [key, value] of Object.entries(availability)) {
    requireEnum(value, `monitoring.availability.${key}`, SIGNAL_STATES);
  }
  for (const key of [
    "authUnexplainedErrorsMax",
    "bookingSmokeFailuresMax",
    "databaseAdvisorErrorsMax",
    "databaseApi5xxMax",
    "runtime5xxMax",
    "runtimeRelevantErrorsMax",
    "smtpUnexplainedFailuresMax",
  ]) {
    requireInteger(thresholds[key], `monitoring.thresholds.${key}`);
  }
  if (Object.values(thresholds).some((value) => value !== 0)) {
    fail("release-blocking monitoring thresholds must all remain zero.");
  }
  for (const key of [
    "authUnexplainedErrors",
    "bookingSmokeFailures",
    "databaseAdvisorErrors",
    "databaseApi5xx",
    "runtime5xx",
    "runtimeRelevantErrors",
    "smtpUnexplainedFailures",
  ]) {
    requireInteger(signals[key], `monitoring.signals.${key}`);
  }
  requireInteger(monitoring.runtimeWindowHours, "monitoring.runtimeWindowHours", { minimum: 24 });
  requireInteger(monitoring.databaseLogWindowMinutes, "monitoring.databaseLogWindowMinutes", {
    minimum: 60,
  });
}

function validateRollback(rollback) {
  requireExactKeys(rollback, "rollback", [
    "admission",
    "catalog",
    "recoveryRequiresSeparateAuthorization",
  ]);
  const admission = requireObject(rollback.admission, "rollback.admission");
  const catalog = requireObject(rollback.catalog, "rollback.catalog");
  requireExactKeys(admission, "rollback.admission", [
    "disableCaptchaBeforeIncompatibleAppRollback",
    "firstAction",
    "preservesExistingLogin",
  ]);
  requireExactKeys(catalog, "rollback.catalog", [
    "deletesHistory",
    "firstAction",
    "preservesHistory",
  ]);
  if (admission.firstAction !== "DISABLE_SIGNUP") {
    fail("rollback.admission.firstAction must be DISABLE_SIGNUP.");
  }
  requireBoolean(admission.preservesExistingLogin, "rollback.admission.preservesExistingLogin");
  requireBoolean(
    admission.disableCaptchaBeforeIncompatibleAppRollback,
    "rollback.admission.disableCaptchaBeforeIncompatibleAppRollback",
  );
  if (catalog.firstAction !== "ARCHIVE_INACCURATE_LISTING") {
    fail("rollback.catalog.firstAction must be ARCHIVE_INACCURATE_LISTING.");
  }
  requireBoolean(catalog.preservesHistory, "rollback.catalog.preservesHistory");
  requireBoolean(catalog.deletesHistory, "rollback.catalog.deletesHistory");
  requireBoolean(
    rollback.recoveryRequiresSeparateAuthorization,
    "rollback.recoveryRequiresSeparateAuthorization",
  );
}

function validateSignoffs(signoffs) {
  if (!Array.isArray(signoffs)) fail("signoffs must be an array.");
  const categories = [];
  for (const [index, signoff] of signoffs.entries()) {
    requireExactKeys(signoff, `signoffs[${index}]`, ["category", "source", "state"]);
    categories.push(requireString(signoff.category, `signoffs[${index}].category`));
    requireEnum(signoff.state, `signoffs[${index}].state`, SIGNOFF_STATES);
    requireString(signoff.source, `signoffs[${index}].source`);
  }
  if (new Set(categories).size !== categories.length) fail("signoff categories must be unique.");
  const actual = [...categories].sort();
  if (JSON.stringify(actual) !== JSON.stringify(REQUIRED_SIGNOFFS)) {
    fail(`signoffs must contain exactly: ${REQUIRED_SIGNOFFS.join(", ")}.`);
  }
}

function validateStructure(evidence, repositoryMigrations) {
  requireExactKeys(evidence, "evidence", [
    "audit",
    "auth",
    "authorization",
    "bookingSmoke",
    "catalog",
    "database",
    "declaredBlockers",
    "failClosed",
    "followUps",
    "monitoring",
    "meetupRelease",
    "rollback",
    "schemaVersion",
    "signoffs",
    "sources",
    "targets",
  ]);
  if (evidence.schemaVersion !== EVIDENCE_SCHEMA_VERSION) {
    fail(`schemaVersion must be ${EVIDENCE_SCHEMA_VERSION}.`);
  }
  scanSensitiveValues(evidence);

  const audit = requireObject(evidence.audit, "audit");
  requireExactKeys(audit, "audit", ["decision", "id", "observedAt", "scope"]);
  requireString(audit.id, "audit.id", /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assertIsoTimestamp(audit.observedAt, "audit.observedAt");
  requireEnum(audit.decision, "audit.decision", DECISIONS);
  if (audit.scope !== "PUBLIC_PAID_RENTAL_LIFECYCLE") {
    fail("audit.scope must be PUBLIC_PAID_RENTAL_LIFECYCLE.");
  }

  const targets = requireObject(evidence.targets, "targets");
  requireExactKeys(targets, "targets", ["deployment", "production", "repository"]);
  const production = requireObject(targets.production, "targets.production");
  requireExactKeys(production, "targets.production", ["applicationUrl", "supabaseProjectRef"]);
  if (production.applicationUrl !== PRODUCTION_APPLICATION_URL) {
    fail(`targets.production.applicationUrl must be ${PRODUCTION_APPLICATION_URL}.`);
  }
  if (production.supabaseProjectRef !== PRODUCTION_PROJECT_REF) {
    fail(`targets.production.supabaseProjectRef must be ${PRODUCTION_PROJECT_REF}.`);
  }
  const repository = requireObject(targets.repository, "targets.repository");
  requireExactKeys(repository, "targets.repository", ["auditedCommit", "migrationCount"]);
  requireString(repository.auditedCommit, "targets.repository.auditedCommit", SHA_PATTERN);
  requireInteger(repository.migrationCount, "targets.repository.migrationCount", { minimum: 1 });
  const deployment = requireObject(targets.deployment, "targets.deployment");
  requireExactKeys(deployment, "targets.deployment", [
    "environment",
    "gitCommit",
    "id",
    "status",
  ]);
  requireString(deployment.id, "targets.deployment.id", DEPLOYMENT_PATTERN);
  requireString(deployment.gitCommit, "targets.deployment.gitCommit", SHA_PATTERN);
  if (deployment.environment !== "production" || deployment.status !== "READY") {
    fail("targets.deployment must identify a READY production deployment.");
  }

  const migrations = requireStringArray(repositoryMigrations, "repositoryMigrations", {
    pattern: MIGRATION_PATTERN,
  });
  const sortedMigrations = [...migrations].sort();
  if (JSON.stringify(migrations) !== JSON.stringify(sortedMigrations)) {
    fail("repositoryMigrations must be sorted.");
  }
  if (repository.migrationCount !== migrations.length) {
    fail("targets.repository.migrationCount does not match the repository migration inventory.");
  }

  const database = requireObject(evidence.database, "database");
  requireExactKeys(database, "database", [
    "appliedMigrationCount",
    "appliedMigrations",
    "securityAdvisorErrors",
    "securityAdvisorWarnings",
  ]);
  const applied = requireStringArray(database.appliedMigrations, "database.appliedMigrations", {
    pattern: MIGRATION_PATTERN,
  });
  if (database.appliedMigrationCount !== applied.length) {
    fail("database.appliedMigrationCount must equal database.appliedMigrations length.");
  }
  if (JSON.stringify(applied) !== JSON.stringify(migrations.slice(0, applied.length))) {
    fail("database.appliedMigrations must be the exact ordered repository prefix.");
  }
  requireInteger(database.securityAdvisorErrors, "database.securityAdvisorErrors");
  requireStringArray(database.securityAdvisorWarnings, "database.securityAdvisorWarnings");

  validateCatalog(requireObject(evidence.catalog, "catalog"));
  validateAuth(requireObject(evidence.auth, "auth"));
  const leakedPasswordWarningPresent = database.securityAdvisorWarnings.includes(
    "Leaked Password Protection Disabled",
  );
  if (
    leakedPasswordWarningPresent === evidence.auth.leakedPasswordProtectionEnabled
  ) {
    fail("leaked-password Auth state must agree with the security-advisor evidence.");
  }
  validateMonitoring(requireObject(evidence.monitoring, "monitoring"));
  const meetupRelease = requireObject(evidence.meetupRelease, "meetupRelease");
  requireExactKeys(meetupRelease, "meetupRelease", [
    "candidateGates",
    "developmentProviderCheck",
    "ownerApprovedPolicyCount",
    "previewEndToEnd",
    "privacyReview",
    "productionProviderConfigured",
    "productionHandoffEnabled",
    "productionMeetupEnabled",
    "providerOperationalControlsVerified",
    "rollbackRehearsal",
  ]);
  requireEnum(meetupRelease.candidateGates, "meetupRelease.candidateGates", PASS_FAIL);
  requireEnum(
    meetupRelease.developmentProviderCheck,
    "meetupRelease.developmentProviderCheck",
    SIGNAL_STATES,
  );
  requireInteger(
    meetupRelease.ownerApprovedPolicyCount,
    "meetupRelease.ownerApprovedPolicyCount",
  );
  requireEnum(meetupRelease.previewEndToEnd, "meetupRelease.previewEndToEnd", SIGNAL_STATES);
  requireEnum(meetupRelease.privacyReview, "meetupRelease.privacyReview", PASS_FAIL);
  requireBoolean(
    meetupRelease.productionProviderConfigured,
    "meetupRelease.productionProviderConfigured",
  );
  requireBoolean(
    meetupRelease.productionHandoffEnabled,
    "meetupRelease.productionHandoffEnabled",
  );
  requireBoolean(
    meetupRelease.productionMeetupEnabled,
    "meetupRelease.productionMeetupEnabled",
  );
  requireBoolean(
    meetupRelease.providerOperationalControlsVerified,
    "meetupRelease.providerOperationalControlsVerified",
  );
  requireEnum(meetupRelease.rollbackRehearsal, "meetupRelease.rollbackRehearsal", SIGNAL_STATES);
  if (
    evidence.monitoring.signals.databaseAdvisorErrors !==
    database.securityAdvisorErrors
  ) {
    fail("monitoring database-advisor signal must match database evidence.");
  }
  if (
    !evidence.auth.customSmtpEnabled &&
    evidence.monitoring.availability.smtp === "PASS"
  ) {
    fail("custom SMTP cannot have a PASS monitoring signal while it is disabled.");
  }

  const smoke = requireObject(evidence.bookingSmoke, "bookingSmoke");
  requireExactKeys(smoke, "bookingSmoke", [
    "crossAccountReadDenied",
    "deploymentId",
    "gitCommit",
    "historyCount",
    "inventorySlug",
    "preApprovalHoldCount",
    "requestCount",
    "result",
    "source",
    "testSessionCleanup",
  ]);
  requireEnum(smoke.result, "bookingSmoke.result", PASS_FAIL);
  requireString(smoke.deploymentId, "bookingSmoke.deploymentId", DEPLOYMENT_PATTERN);
  requireString(smoke.gitCommit, "bookingSmoke.gitCommit", SHA_PATTERN);
  requireString(smoke.inventorySlug, "bookingSmoke.inventorySlug", /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  requireInteger(smoke.requestCount, "bookingSmoke.requestCount");
  requireInteger(smoke.historyCount, "bookingSmoke.historyCount");
  requireInteger(smoke.preApprovalHoldCount, "bookingSmoke.preApprovalHoldCount");
  requireEnum(smoke.crossAccountReadDenied, "bookingSmoke.crossAccountReadDenied", PASS_FAIL);
  requireEnum(smoke.testSessionCleanup, "bookingSmoke.testSessionCleanup", PASS_FAIL);
  requireString(smoke.source, "bookingSmoke.source");
  if (!evidence.catalog.approvedSlugs.includes(smoke.inventorySlug)) {
    fail("bookingSmoke.inventorySlug must be present in catalog.approvedSlugs.");
  }

  validateRollback(requireObject(evidence.rollback, "rollback"));
  validateSignoffs(evidence.signoffs);

  const authorization = requireObject(evidence.authorization, "authorization");
  requireExactKeys(authorization, "authorization", [
    "productionMutationAuthorized",
    "source",
    "windowEndsAt",
    "windowStartsAt",
  ]);
  requireString(authorization.source, "authorization.source");
  requireBoolean(
    authorization.productionMutationAuthorized,
    "authorization.productionMutationAuthorized",
  );
  if (authorization.productionMutationAuthorized) {
    assertIsoTimestamp(authorization.windowStartsAt, "authorization.windowStartsAt");
    assertIsoTimestamp(authorization.windowEndsAt, "authorization.windowEndsAt");
    if (Date.parse(authorization.windowStartsAt) >= Date.parse(authorization.windowEndsAt)) {
      fail("authorization window must have a positive duration.");
    }
    const evidenceAgeAtWindow =
      Date.parse(authorization.windowStartsAt) - Date.parse(audit.observedAt);
    if (evidenceAgeAtWindow < 0 || evidenceAgeAtWindow > 24 * 60 * 60 * 1000) {
      fail("authorized GO evidence must be frozen within 24 hours before its window.");
    }
  } else if (authorization.windowStartsAt !== null || authorization.windowEndsAt !== null) {
    fail("an unauthorized Production mutation must not claim an approved window.");
  }

  const failClosed = requireObject(evidence.failClosed, "failClosed");
  requireExactKeys(failClosed, "failClosed", [
    "inPersonIdentityCheckRequired",
    "onlineGovernmentIdCollectionDisabled",
    "paidLifecycleChangeApplied",
    "productionStateChangedByAudit",
  ]);
  requireBoolean(failClosed.paidLifecycleChangeApplied, "failClosed.paidLifecycleChangeApplied");
  requireBoolean(
    failClosed.productionStateChangedByAudit,
    "failClosed.productionStateChangedByAudit",
  );
  requireBoolean(
    failClosed.inPersonIdentityCheckRequired,
    "failClosed.inPersonIdentityCheckRequired",
  );
  requireBoolean(
    failClosed.onlineGovernmentIdCollectionDisabled,
    "failClosed.onlineGovernmentIdCollectionDisabled",
  );

  requireStringArray(evidence.followUps, "followUps");
  requireStringArray(evidence.sources, "sources");
  requireStringArray(evidence.declaredBlockers, "declaredBlockers", {
    pattern: /^[A-Z][A-Z0-9_]+$/,
  });
}

function thresholdBreached(monitoring) {
  const pairs = [
    ["authUnexplainedErrors", "authUnexplainedErrorsMax"],
    ["bookingSmokeFailures", "bookingSmokeFailuresMax"],
    ["databaseAdvisorErrors", "databaseAdvisorErrorsMax"],
    ["databaseApi5xx", "databaseApi5xxMax"],
    ["runtime5xx", "runtime5xxMax"],
    ["runtimeRelevantErrors", "runtimeRelevantErrorsMax"],
    ["smtpUnexplainedFailures", "smtpUnexplainedFailuresMax"],
  ];
  return pairs.some(
    ([signal, threshold]) => monitoring.signals[signal] > monitoring.thresholds[threshold],
  );
}

function computeBlockers(evidence, repositoryMigrations) {
  const blockers = [];
  const add = (condition, blocker) => {
    if (condition) blockers.push(blocker);
  };

  add(
    !evidence.authorization.productionMutationAuthorized,
    "MUTATION_AUTHORIZATION_MISSING",
  );
  add(
    evidence.targets.deployment.gitCommit !== evidence.targets.repository.auditedCommit,
    "DEPLOYED_COMMIT_DIFFERS_FROM_AUDITED_REPOSITORY",
  );
  add(
    evidence.database.appliedMigrations.length !== repositoryMigrations.length,
    "PRODUCTION_MIGRATIONS_BEHIND_REPOSITORY",
  );
  add(!evidence.auth.customSmtpEnabled, "CUSTOM_SMTP_DISABLED");
  add(
    evidence.auth.passwordAuthenticationUsedByApplication &&
      !evidence.auth.leakedPasswordProtectionEnabled,
    "LEAKED_PASSWORD_PROTECTION_DISABLED",
  );
  add(
    evidence.database.securityAdvisorWarnings.some(
      (warning) => warning !== "Leaked Password Protection Disabled",
    ),
    "SECURITY_ADVISOR_WARNING_OPEN",
  );
  add(
    evidence.signoffs.find((signoff) => signoff.category === "legal_privacy")?.state !==
      "APPROVED",
    "LEGAL_PRIVACY_APPROVAL_OPEN",
  );
  add(
    evidence.signoffs.some((signoff) => signoff.state !== "APPROVED"),
    "REQUIRED_SIGNOFFS_INCOMPLETE",
  );
  add(
    evidence.catalog.publicProjection !== "PASS" ||
      evidence.catalog.privateProjectionDenied !== "PASS" ||
      evidence.catalog.publishedCameraCount < 1 ||
      evidence.catalog.approvedPhotoCount < 1,
    "CATALOG_EVIDENCE_FAILED",
  );
  add(
    !evidence.auth.signupEnabled ||
      !evidence.auth.signupEnabledLastAtActivation ||
      !evidence.auth.hostedCaptchaEnabled ||
      evidence.auth.captchaProvider !== "turnstile" ||
      !evidence.auth.applicationSiteKeyConfigured ||
      !evidence.auth.emailConfirmationEnabled ||
      evidence.auth.otpDigits !== 6 ||
      evidence.auth.otpExpirySeconds !== 900 ||
      evidence.auth.passwordMinimumLength < 15 ||
      evidence.auth.existingAdminSignIn !== "PASS" ||
      evidence.auth.existingRenterContinuity !== "PASS" ||
      evidence.auth.protectedRouteAuthorization !== "PASS" ||
      evidence.auth.totalIdentityCount < 2 ||
      evidence.auth.adminRecordCount !== 1 ||
      !evidence.auth.canonicalAdminRecord,
    "IDENTITY_OR_AUTH_COMPATIBILITY_FAILED",
  );
  add(
    evidence.bookingSmoke.result !== "PASS" ||
      evidence.bookingSmoke.requestCount !== 1 ||
      evidence.bookingSmoke.historyCount !== 1 ||
      evidence.bookingSmoke.preApprovalHoldCount !== 0 ||
      evidence.bookingSmoke.crossAccountReadDenied !== "PASS" ||
      evidence.bookingSmoke.testSessionCleanup !== "PASS",
    "BOOKING_SMOKE_EVIDENCE_FAILED",
  );
  add(thresholdBreached(evidence.monitoring), "MONITORING_THRESHOLD_BREACH");
  add(
    Object.values(evidence.monitoring.availability).some((state) => state !== "PASS"),
    "MONITORING_SIGNAL_UNAVAILABLE",
  );
  add(evidence.meetupRelease.candidateGates !== "PASS", "MEETUP_CANDIDATE_GATES_FAILED");
  add(
    evidence.meetupRelease.developmentProviderCheck !== "PASS",
    "MEETUP_DEVELOPMENT_PROVIDER_CHECK_MISSING",
  );
  add(
    evidence.meetupRelease.previewEndToEnd !== "PASS",
    "MEETUP_PREVIEW_STORY_MISSING",
  );
  add(evidence.meetupRelease.privacyReview !== "PASS", "MEETUP_PRIVACY_REVIEW_FAILED");
  add(
    !evidence.meetupRelease.productionProviderConfigured ||
      !evidence.meetupRelease.productionHandoffEnabled ||
      !evidence.meetupRelease.productionMeetupEnabled,
    "MEETUP_PRODUCTION_CONFIGURATION_MISSING",
  );
  add(
    evidence.meetupRelease.ownerApprovedPolicyCount < 1,
    "MEETUP_OWNER_POLICY_MISSING",
  );
  add(
    !evidence.meetupRelease.providerOperationalControlsVerified,
    "MEETUP_PROVIDER_CONTROLS_MISSING",
  );
  add(
    evidence.meetupRelease.rollbackRehearsal !== "PASS",
    "MEETUP_ROLLBACK_REHEARSAL_MISSING",
  );
  add(
    evidence.rollback.admission.firstAction !== "DISABLE_SIGNUP" ||
      !evidence.rollback.admission.preservesExistingLogin ||
      !evidence.rollback.admission.disableCaptchaBeforeIncompatibleAppRollback ||
      evidence.rollback.catalog.firstAction !== "ARCHIVE_INACCURATE_LISTING" ||
      !evidence.rollback.catalog.preservesHistory ||
      evidence.rollback.catalog.deletesHistory ||
      !evidence.rollback.recoveryRequiresSeparateAuthorization,
    "ROLLBACK_CONTRACT_FAILED",
  );

  return blockers.sort();
}

export function evaluateLaunchReadiness(evidence, { repositoryMigrations }) {
  validateStructure(evidence, repositoryMigrations);
  const blockers = computeBlockers(evidence, repositoryMigrations);
  const decision = blockers.length === 0 ? "GO" : "NO_GO";
  const declared = [...evidence.declaredBlockers].sort();

  if (evidence.audit.decision !== decision) {
    fail(`audit.decision must be ${decision} for the recorded evidence.`);
  }
  if (JSON.stringify(declared) !== JSON.stringify(blockers)) {
    fail("declaredBlockers must exactly match the computed blocker set.");
  }
  if (
    decision === "NO_GO" &&
    evidence.failClosed.productionStateChangedByAudit
  ) {
    fail("a NO_GO audit must prove that the audit itself did not mutate Production.");
  }
  if (
    decision === "GO" &&
    (!evidence.failClosed.paidLifecycleChangeApplied ||
      !evidence.failClosed.onlineGovernmentIdCollectionDisabled ||
      !evidence.failClosed.inPersonIdentityCheckRequired)
  ) {
    fail("a GO audit must prove the paid lifecycle and minimized in-person identity control are active.");
  }

  return {
    auditId: evidence.audit.id,
    blockers,
    decision,
    observedAt: evidence.audit.observedAt,
    productionMigrationCount: evidence.database.appliedMigrations.length,
    repositoryMigrationCount: repositoryMigrations.length,
  };
}
