import { describe, expect, it } from "vitest";

import {
  admitRelease,
  assertCurrentMain,
  verifyDeployment,
} from "./release-gate-policy.mjs";

const shaA = "a".repeat(40);
const shaB = "b".repeat(40);
const projectId = "prj_BjIN6En8T4H3ikS8ixPR9mpIDQ0p";
const teamId = "team_3Iehh9kIbX87EbfdCncg6m8m";

function automatic(overrides = {}) {
  return {
    eventName: "workflow_run",
    workflowConclusion: "success",
    workflowEvent: "push",
    workflowBranch: "main",
    workflowSha: shaA,
    currentMainSha: shaA,
    ...overrides,
  };
}

function emergency(overrides = {}) {
  return {
    eventName: "workflow_dispatch",
    workflowRef: "refs/heads/main",
    manualSha: shaA,
    currentMainSha: shaA,
    emergencyConfirmation: "RELEASE_EXACT_MAIN",
    emergencyReason: "Retry after reconciled provider timeout.",
    ciVerified: true,
    ...overrides,
  };
}

function deployment(overrides = {}) {
  return {
    id: "dpl_Candidate123",
    target: "production",
    readyState: "READY",
    projectId,
    team: { id: teamId },
    meta: { githubCommitSha: shaA, githubCommitRef: "main" },
    alias: [],
    ...overrides,
  };
}

describe("release admission", () => {
  it("accepts only successful automatic main-push CI for current main", () => {
    expect(admitRelease(automatic())).toBe(shaA);
  });

  it.each([
    ["failed CI", { workflowConclusion: "failure" }],
    ["cancelled CI", { workflowConclusion: "cancelled" }],
    ["skipped CI", { workflowConclusion: "skipped" }],
    ["manual CI", { workflowEvent: "workflow_dispatch" }],
    ["wrong branch", { workflowBranch: "feature" }],
    ["wrong SHA", { workflowSha: shaB }],
  ])("refuses %s before release work", (_name, overrides) => {
    expect(() => admitRelease(automatic(overrides))).toThrow();
  });

  it("accepts a bounded, confirmed emergency retry with prior CI", () => {
    expect(admitRelease(emergency())).toBe(shaA);
  });

  it.each([
    ["wrong workflow ref", { workflowRef: "refs/heads/feature" }],
    ["stale SHA", { manualSha: shaB }],
    ["missing confirmation", { emergencyConfirmation: "yes" }],
    ["missing CI", { ciVerified: false }],
    ["unsafe reason", { emergencyReason: "secret\nnext-line" }],
  ])("refuses emergency dispatch with %s", (_name, overrides) => {
    expect(() => admitRelease(emergency(overrides))).toThrow();
  });

  it("refuses a superseded release at every mutation boundary", () => {
    expect(assertCurrentMain(shaA, shaA)).toBe(shaA);
    expect(() => assertCurrentMain(shaA, shaB)).toThrow("superseded");
  });
});

describe("Vercel deployment identity", () => {
  const expected = {
    expectedId: "dpl_Candidate123",
    expectedSha: shaA,
    expectedProjectId: projectId,
    expectedTeamId: teamId,
    requireUnaliased: true,
  };

  it("accepts the exact READY, unaliased production candidate", () => {
    expect(verifyDeployment(deployment(), expected)).toBe("dpl_Candidate123");
  });

  it.each([
    ["wrong deployment", { id: "dpl_Other123" }],
    ["wrong target", { target: "preview" }],
    ["not ready", { readyState: "ERROR" }],
    ["wrong project", { projectId: "prj_Other123" }],
    ["wrong team", { team: { id: "team_Other123" } }],
    ["wrong SHA", { meta: { githubCommitSha: shaB, githubCommitRef: "main" } }],
    ["wrong ref", { meta: { githubCommitSha: shaA, githubCommitRef: "feature" } }],
    ["already live", { alias: ["camnook.shop"] }],
  ])("refuses %s", (_name, overrides) => {
    expect(() => verifyDeployment(deployment(overrides), expected)).toThrow();
  });
});
