import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8",
);
const vercelConfig = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
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
    expect(workflow).toContain("needs: [admit, candidate]");
    expect(workflow).toContain("needs: [admit, candidate, development]");
    expect(workflow).toContain("needs: [admit, candidate, production-database]");
    expect(workflow.match(/release-gate-policy\.mjs current-main/g)?.length).toBeGreaterThanOrEqual(3);
    expect(workflow).toContain('test "$(git rev-parse HEAD)" = "$RELEASE_SHA"');
  });

  it("stages an immutable unaliased candidate with disabled feature flags", () => {
    expect(workflow).toContain("vercel@59.3.0");
    expect(workflow).toContain("vercel build --prod");
    expect(workflow).toContain("vercel deploy --prebuilt --prod --skip-domain");
    expect(workflow).toContain('--meta githubCommitSha="$RELEASE_SHA"');
    expect(workflow).toContain("HANDOFF_SCHEDULING_ENABLED: \"false\"");
    expect(workflow).toContain("MEETUP_PLANNING_ENABLED: \"false\"");
    expect(workflow).toContain("unaliased");
    expect(vercelConfig.git.deploymentEnabled.main).toBe(false);
  });

  it("orders Development and Production schema gates before promotion", () => {
    const candidate = position("name: Stage immutable Production candidate");
    const development = position("name: Migrate and verify Development");
    const production = position("name: Migrate and verify Production");
    const promote = position("name: Promote exact candidate and smoke");

    expect(development).toBeGreaterThan(candidate);
    expect(production).toBeGreaterThan(development);
    expect(promote).toBeGreaterThan(production);
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
    expect(workflow.match(/supabase migration list --linked/g)?.length).toBeGreaterThanOrEqual(6);
    expect(workflow).not.toContain("supabase db reset");
    expect(workflow).not.toContain("supabase config push");
    expect(workflow).not.toContain("migration repair");
  });

  it("promotes only the exact candidate and restores the prior alias on smoke failure", () => {
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
});
