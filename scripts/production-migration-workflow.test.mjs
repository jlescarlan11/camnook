import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/migrate-production.yml", import.meta.url),
  "utf8",
);

describe("Production migration workflow policy", () => {
  it("automatically follows a successful automatic Development rollout from main", () => {
    expect(workflow).toContain("workflow_run:");
    expect(workflow).toContain("workflows: [Migrate Development]");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("types: [completed]");
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(workflow).toContain("github.event.workflow_run.event == 'workflow_run'");
    expect(workflow).not.toContain("workflow_dispatch:");
  });

  it("migrates the exact Development-verified revision to the exact Production project", () => {
    expect(workflow).toContain("ref: ${{ github.event.workflow_run.head_sha }}");
    expect(workflow).toContain("RELEASE_SHA: ${{ github.event.workflow_run.head_sha }}");
    expect(workflow).toContain('test "$(git rev-parse HEAD)" = "$RELEASE_SHA"');
    expect(workflow).toContain("EXPECTED_PROJECT_ID: iegcixcevvkryfwfotqz");
    expect(workflow).toContain('test "$SUPABASE_PROJECT_ID" = "$EXPECTED_PROJECT_ID"');
    expect(workflow).toContain("environment: production");
  });

  it("previews, applies, and verifies migrations in fail-closed order", () => {
    const dryRun = workflow.indexOf("supabase db push --linked --dry-run");
    const apply = workflow.indexOf("supabase db push --linked", dryRun + 1);
    const verify = workflow.indexOf("supabase migration list --linked");
    const policyCheck = workflow.indexOf("005_verification_policy_disabled.sql");
    const advisors = workflow.indexOf("supabase db advisors --linked");

    expect(dryRun).toBeGreaterThan(-1);
    expect(apply).toBeGreaterThan(dryRun);
    expect(verify).toBeGreaterThan(apply);
    expect(policyCheck).toBeGreaterThan(verify);
    expect(advisors).toBeGreaterThan(policyCheck);
  });
});
