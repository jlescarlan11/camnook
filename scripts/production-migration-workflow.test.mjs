import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8",
);
const productionAuthWorkflow = readFileSync(
  new URL("../.github/workflows/configure-production-auth.yml", import.meta.url),
  "utf8",
);
const vercelConfig = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
);
const prePushHook = readFileSync(
  new URL("../.githooks/pre-push", import.meta.url),
  "utf8",
);

function position(text) {
  const index = workflow.indexOf(text);
  expect(index).toBeGreaterThan(-1);
  return index;
}

describe("immutable release workflow policy", () => {
  it("admits only successful automatic main-push CI or a guarded emergency retry", () => {
    expect(workflow).toContain("workflows: [CI]");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).toContain("github.event.workflow_run.event == 'push'");
    expect(workflow).toContain("release_sha:");
    expect(workflow).toContain("RELEASE_EXACT_MAIN");
    expect(workflow).toContain("actions/workflows/ci.yml/runs");
    expect(workflow).toContain("node scripts/release-gate-policy.mjs admit");
  });

  it("uses one non-cancelling release lock and exact SHA dependencies", () => {
    expect(workflow).toContain("group: camnook-release");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("needs: [admit, development]");
    expect(workflow.match(/release-gate-policy\.mjs current-main/g)?.length).toBeGreaterThanOrEqual(3);
    expect(workflow).toContain('test "$(git rev-parse HEAD)" = "$RELEASE_SHA"');
  });

  it("stages an immutable unaliased candidate with always-on scheduling and meetup planning", () => {
    expect(workflow).toContain(
      "pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86",
    );
    expect(workflow).toContain('test "$(pnpm --version)" = "10.33.1"');
    expect(workflow).toContain("vercel@59.10.0");
    expect(workflow).toContain("vercel build --prod");
    expect(workflow).toContain("vercel deploy --prebuilt --prod --skip-domain");
    expect(workflow).toContain('--meta githubCommitSha="$RELEASE_SHA"');
    expect(workflow).not.toContain("MEETUP_PLANNING_ENABLED");
    expect(workflow).not.toContain("HANDOFF_SCHEDULING_ENABLED");
    expect(workflow).toContain("unaliased");
    expect(vercelConfig.git.deploymentEnabled.main).toBe(false);
  });

  it("runs Development before one sequential Production approval gate", () => {
    const production = workflow.slice(
      position("  production-release:"),
      position("  development:"),
    );
    const development = workflow.slice(position("  development:"));

    expect(development).toContain("needs: admit");
    expect(development).toContain("environment: development");
    expect(development).not.toContain("environment: production");
    expect(production).toContain("needs: [admit, development]");
    expect(production).toContain("environment: production");
    expect(workflow.match(/environment: production/g)).toHaveLength(1);
    expect(position("name: Stage unaliased Production candidate")).toBeLessThan(
      position("name: Apply Production migrations after supersession check"),
    );
    expect(position("name: Apply Production migrations after supersession check")).toBeLessThan(
      position("name: Promote candidate with reconciliation"),
    );
    expect(workflow).toContain("EXPECTED_PROJECT_ID: ekmoiepalelqpmemvrkl");
    expect(workflow).toContain("EXPECTED_PROJECT_ID: iegcixcevvkryfwfotqz");
    expect(workflow).toContain("run-hosted-database-tests.sh --target development");
    expect(workflow).toContain("run-hosted-database-tests.sh --target production");
    expect(workflow.match(/supabase db advisors --linked/g)).toHaveLength(2);
  });

  it("reconciles indeterminate migrations and never performs destructive recovery", () => {
    expect(workflow).toContain("Development migration outcome requires reconciliation before retry");
    expect(workflow).toContain("Production migration outcome requires reconciliation before retry");
    expect(workflow).toContain("Reconcile Development history after failure");
    expect(workflow).toContain("Reconcile Production history after failure");
    expect(workflow).toContain("steps.production-link.outputs.linked == 'true'");
    expect(workflow.match(/supabase migration list --linked/g)?.length).toBeGreaterThanOrEqual(6);
    expect(workflow).not.toContain("supabase db reset");
    expect(workflow).not.toContain("supabase config push");
    expect(workflow).not.toContain("migration repair");
  });

  it("promotes only the exact candidate and restores the prior alias on smoke failure", () => {
    expect(position("name: Run Production security advisors")).toBeLessThan(
      position("name: Smoke staged candidate before promotion"),
    );
    expect(position("name: Smoke staged candidate before promotion")).toBeLessThan(
      position("name: Promote candidate with reconciliation"),
    );
    expect(workflow).toContain(
      'vercel curl / --deployment "$CANDIDATE_ID" --token "$VERCEL_TOKEN"',
    );
    expect(workflow).toContain('candidate_status" != "200"');
    expect(workflow).toContain('vercel promote "$CANDIDATE_ID"');
    expect(workflow).toContain('test "$live_id" = "$CANDIDATE_ID"');
    expect(workflow).toContain('vercel rollback "$PRIOR_DEPLOYMENT_ID"');
    expect(workflow).toContain('test "$live_id" = "$PRIOR_DEPLOYMENT_ID"');
    expect(workflow).toContain("https://camnook.shop/");
    expect(workflow).toContain("schema remains forward-only");
  });

  it("removes the independent database workflow bypasses", () => {
    expect(
      existsSync(new URL("../.github/workflows/migrate-development.yml", import.meta.url)),
    ).toBe(false);
    expect(
      existsSync(new URL("../.github/workflows/migrate-production.yml", import.meta.url)),
    ).toBe(false);
  });

  it("uses the repository-pinned package manager for local release checks", () => {
    expect(prePushHook).toContain("corepack pnpm verify:push");
    expect(prePushHook).not.toMatch(/^pnpm verify:push$/m);
  });
});

describe("Production Auth configuration workflow policy", () => {
  it("never automatically retries an indeterminate hosted Auth mutation", () => {
    expect(productionAuthWorkflow).toContain("--retry 0");
    expect(productionAuthWorkflow).not.toContain("--retry-all-errors");
    expect(productionAuthWorkflow).toContain(
      "Production Auth configuration outcome is indeterminate; reconcile hosted Auth before any retry.",
    );
  });
});
