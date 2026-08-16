import { describe, expect, it } from "vitest";

import { evaluateLaunchReadiness, LaunchReadinessError } from "./production-launch-readiness-lib.mjs";

const repositoryMigrations = Array.from(
  { length: 4 },
  (_, index) => `2026081600000${index + 1}_migration_${index + 1}.sql`,
);

function evidence(overrides = {}) {
  const base = {
    schemaVersion: 2,
    audit: {
      decision: "NO_GO",
      id: "sprint-8-audit",
      observedAt: "2026-08-16T13:51:20Z",
      scope: "PUBLIC_PAID_RENTAL_LIFECYCLE",
    },
    targets: {
      deployment: {
        environment: "production",
        gitCommit: "b".repeat(40),
        id: "dpl_Production123",
        status: "READY",
      },
      production: {
        applicationUrl: "https://camnook.shop",
        supabaseProjectRef: "iegcixcevvkryfwfotqz",
      },
      repository: { auditedCommit: "a".repeat(40), migrationCount: 4 },
    },
    database: {
      appliedMigrationCount: 2,
      appliedMigrations: repositoryMigrations.slice(0, 2),
      securityAdvisorErrors: 0,
      securityAdvisorWarnings: ["Leaked Password Protection Disabled"],
    },
    catalog: {
      accessoryRecordCount: 5,
      approvedPhotoCount: 3,
      approvedSlugs: ["canon-eos-r50"],
      dailyRatePhp: "450.00",
      privateProjectionDenied: "PASS",
      publicProjection: "PASS",
      publishedBusyPeriodCount: 0,
      publishedCameraCount: 1,
      securityDepositPhp: "1000.00",
    },
    auth: {
      adminRecordCount: 1,
      applicationSiteKeyConfigured: true,
      canonicalAdminRecord: true,
      captchaProvider: "turnstile",
      customSmtpEnabled: false,
      emailConfirmationEnabled: true,
      emailSendLimitPerHour: 4,
      existingAdminSignIn: "PASS",
      existingRenterContinuity: "PASS",
      hostedCaptchaEnabled: true,
      leakedPasswordProtectionEnabled: false,
      otpDigits: 6,
      otpExpirySeconds: 900,
      passwordAuthenticationUsedByApplication: false,
      passwordMinimumLength: 15,
      protectedRouteAuthorization: "PASS",
      signupEnabled: true,
      signupEnabledLastAtActivation: true,
      signupSignInLimitPerFiveMinutes: 30,
      totalIdentityCount: 2,
      verificationLimitPerFiveMinutes: 30,
    },
    bookingSmoke: {
      crossAccountReadDenied: "PASS",
      deploymentId: "dpl_Production123",
      gitCommit: "b".repeat(40),
      historyCount: 1,
      inventorySlug: "canon-eos-r50",
      preApprovalHoldCount: 0,
      requestCount: 1,
      result: "PASS",
      source: "https://github.com/jlescarlan11/camnook/issues/10",
      testSessionCleanup: "PASS",
    },
    monitoring: {
      availability: {
        auth: "PASS",
        booking: "PASS",
        database: "PASS",
        runtime: "PASS",
        smtp: "UNAVAILABLE",
      },
      databaseLogWindowMinutes: 60,
      runtimeWindowHours: 24,
      signals: {
        authUnexplainedErrors: 0,
        bookingSmokeFailures: 0,
        databaseAdvisorErrors: 0,
        databaseApi5xx: 0,
        runtime5xx: 0,
        runtimeRelevantErrors: 0,
        smtpUnexplainedFailures: 0,
      },
      thresholds: {
        authUnexplainedErrorsMax: 0,
        bookingSmokeFailuresMax: 0,
        databaseAdvisorErrorsMax: 0,
        databaseApi5xxMax: 0,
        runtime5xxMax: 0,
        runtimeRelevantErrorsMax: 0,
        smtpUnexplainedFailuresMax: 0,
      },
    },
    rollback: {
      admission: {
        disableCaptchaBeforeIncompatibleAppRollback: true,
        firstAction: "DISABLE_SIGNUP",
        preservesExistingLogin: true,
      },
      catalog: {
        deletesHistory: false,
        firstAction: "ARCHIVE_INACCURATE_LISTING",
        preservesHistory: true,
      },
      recoveryRequiresSeparateAuthorization: true,
    },
    signoffs: [
      { category: "contract_legal", source: "not-recorded", state: "MISSING" },
      { category: "legal_privacy", source: "issue-26-open", state: "OPEN" },
      { category: "operations", source: "not-recorded", state: "MISSING" },
      { category: "release_owner", source: "no-go-record", state: "APPROVED" },
      { category: "security_recovery", source: "not-recorded", state: "MISSING" },
      { category: "tax_business", source: "not-recorded", state: "MISSING" },
    ],
    authorization: {
      productionMutationAuthorized: false,
      source: "NOT_AUTHORIZED",
      windowEndsAt: null,
      windowStartsAt: null,
    },
    failClosed: {
      inPersonIdentityCheckRequired: true,
      onlineGovernmentIdCollectionDisabled: true,
      paidLifecycleChangeApplied: false,
      productionStateChangedByAudit: false,
    },
    declaredBlockers: [
      "CUSTOM_SMTP_DISABLED",
      "DEPLOYED_COMMIT_DIFFERS_FROM_AUDITED_REPOSITORY",
      "LEGAL_PRIVACY_APPROVAL_OPEN",
      "MONITORING_SIGNAL_UNAVAILABLE",
      "MUTATION_AUTHORIZATION_MISSING",
      "PRODUCTION_MIGRATIONS_BEHIND_REPOSITORY",
      "REQUIRED_SIGNOFFS_INCOMPLETE",
    ],
    followUps: ["Keep paid lifecycle closed."],
    sources: ["https://github.com/jlescarlan11/camnook/issues/26"],
  };
  return { ...base, ...overrides };
}

describe("production launch readiness evidence", () => {
  it("verifies an evidence-backed NO_GO and its exact blockers", () => {
    expect(evaluateLaunchReadiness(evidence(), { repositoryMigrations })).toEqual({
      auditId: "sprint-8-audit",
      blockers: [
        "CUSTOM_SMTP_DISABLED",
        "DEPLOYED_COMMIT_DIFFERS_FROM_AUDITED_REPOSITORY",
        "LEGAL_PRIVACY_APPROVAL_OPEN",
        "MONITORING_SIGNAL_UNAVAILABLE",
        "MUTATION_AUTHORIZATION_MISSING",
        "PRODUCTION_MIGRATIONS_BEHIND_REPOSITORY",
        "REQUIRED_SIGNOFFS_INCOMPLETE",
      ],
      decision: "NO_GO",
      observedAt: "2026-08-16T13:51:20Z",
      productionMigrationCount: 2,
      repositoryMigrationCount: 4,
    });
  });

  it("accepts GO only when deployment, migrations, authorization, Auth, and signoffs agree", () => {
    const value = evidence();
    value.audit.decision = "GO";
    value.targets.deployment.gitCommit = value.targets.repository.auditedCommit;
    value.bookingSmoke.gitCommit = value.targets.deployment.gitCommit;
    value.bookingSmoke.deploymentId = value.targets.deployment.id;
    value.database.appliedMigrationCount = repositoryMigrations.length;
    value.database.appliedMigrations = repositoryMigrations;
    value.auth.customSmtpEnabled = true;
    value.monitoring.availability.smtp = "PASS";
    value.signoffs = value.signoffs.map((signoff) => ({ ...signoff, state: "APPROVED" }));
    value.authorization = {
      productionMutationAuthorized: true,
      source: "approved-window-record",
      windowEndsAt: "2026-08-16T15:00:00Z",
      windowStartsAt: "2026-08-16T14:00:00Z",
    };
    value.failClosed.paidLifecycleChangeApplied = true;
    value.declaredBlockers = [];

    expect(evaluateLaunchReadiness(value, { repositoryMigrations }).decision).toBe("GO");
  });

  it("rejects a declared GO when a release blocker exists", () => {
    const value = evidence();
    value.audit.decision = "GO";
    expect(() => evaluateLaunchReadiness(value, { repositoryMigrations })).toThrow(
      /audit\.decision must be NO_GO/,
    );
  });

  it("rejects migration histories that are not the exact repository prefix", () => {
    const value = evidence();
    value.database.appliedMigrations = [repositoryMigrations[0], repositoryMigrations[2]];
    expect(() => evaluateLaunchReadiness(value, { repositoryMigrations })).toThrow(
      /exact ordered repository prefix/,
    );
  });

  it("rejects a NO_GO record that claims Production changed", () => {
    const value = evidence();
    value.failClosed.productionStateChangedByAudit = true;
    expect(() => evaluateLaunchReadiness(value, { repositoryMigrations })).toThrow(
      /audit itself did not mutate Production/,
    );
  });

  it.each([
    ["email address", { followUps: ["Contact renter@example.com"] }],
    ["sensitive field", { accessToken: "not-even-a-real-token" }],
    ["provider secret", { followUps: ["sb_secret_examplevalue"] }],
  ])("rejects %s in release evidence", (_label, override) => {
    const value = evidence(override);
    expect(() => evaluateLaunchReadiness(value, { repositoryMigrations })).toThrow(
      LaunchReadinessError,
    );
  });

  it("rejects threshold breaches even when declared blockers omit them", () => {
    const value = evidence();
    value.monitoring.signals.runtime5xx = 1;
    expect(() => evaluateLaunchReadiness(value, { repositoryMigrations })).toThrow(
      /declaredBlockers must exactly match/,
    );
  });

  it("fails closed when the hosted OTP contract drifts", () => {
    const value = evidence();
    value.auth.otpExpirySeconds = 3_600;
    expect(() => evaluateLaunchReadiness(value, { repositoryMigrations })).toThrow(
      /declaredBlockers must exactly match/,
    );
  });

  it("rejects contradictory Auth and advisor evidence", () => {
    const value = evidence();
    value.auth.leakedPasswordProtectionEnabled = true;
    expect(() => evaluateLaunchReadiness(value, { repositoryMigrations })).toThrow(
      /must agree with the security-advisor evidence/,
    );
  });
});
