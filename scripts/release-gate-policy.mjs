import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const shaPattern = /^[0-9a-f]{40}$/;
const deploymentIdPattern = /^dpl_[A-Za-z0-9]+$/;
const projectIdPattern = /^prj_[A-Za-z0-9]+$/;
const teamIdPattern = /^team_[A-Za-z0-9]+$/;
const emergencyReasonPattern = /^[A-Za-z0-9][A-Za-z0-9 .,/_:()-]{10,158}[A-Za-z0-9.)]$/;

function requireSha(value, label) {
  if (!shaPattern.test(value ?? "")) throw new Error(`${label} is not a full Git SHA`);
  return value;
}

export function admitRelease(input) {
  const currentMainSha = requireSha(input.currentMainSha, "current main");

  if (input.eventName === "workflow_run") {
    const releaseSha = requireSha(input.workflowSha, "workflow SHA");
    if (
      input.workflowConclusion !== "success" ||
      input.workflowEvent !== "push" ||
      input.workflowBranch !== "main"
    ) {
      throw new Error("automatic release requires successful CI from a main push");
    }
    if (releaseSha !== currentMainSha) {
      throw new Error("automatic release was superseded by a newer main SHA");
    }
    return releaseSha;
  }

  if (input.eventName === "workflow_dispatch") {
    const releaseSha = requireSha(input.manualSha, "manual release SHA");
    if (input.workflowRef !== "refs/heads/main") {
      throw new Error("emergency release must dispatch the workflow from main");
    }
    if (releaseSha !== currentMainSha) {
      throw new Error("emergency release SHA must equal current main");
    }
    if (input.emergencyConfirmation !== "RELEASE_EXACT_MAIN") {
      throw new Error("emergency release confirmation is invalid");
    }
    if (!emergencyReasonPattern.test(input.emergencyReason ?? "")) {
      throw new Error("emergency reason must be a bounded, single-line description");
    }
    if (input.ciVerified !== true) {
      throw new Error("emergency release requires an existing successful main-push CI run");
    }
    return releaseSha;
  }

  throw new Error("release event is not authorized");
}

export function assertCurrentMain(expectedSha, currentMainSha) {
  const expected = requireSha(expectedSha, "release SHA");
  const current = requireSha(currentMainSha, "current main");
  if (expected !== current) throw new Error("release SHA is superseded");
  return expected;
}

export function verifyDeployment(
  deployment,
  { expectedId, expectedSha, expectedProjectId, expectedTeamId, requireUnaliased },
) {
  if (!deployment || typeof deployment !== "object" || Array.isArray(deployment)) {
    throw new Error("deployment response is invalid");
  }
  if (!deploymentIdPattern.test(expectedId) || deployment.id !== expectedId) {
    throw new Error("deployment identity mismatch");
  }
  requireSha(expectedSha, "expected deployment SHA");
  if (!projectIdPattern.test(expectedProjectId) || deployment.projectId !== expectedProjectId) {
    throw new Error("deployment project mismatch");
  }
  if (!teamIdPattern.test(expectedTeamId) || deployment.team?.id !== expectedTeamId) {
    throw new Error("deployment team mismatch");
  }
  if (
    deployment.target !== "production" ||
    deployment.readyState !== "READY" ||
    deployment.meta?.githubCommitSha !== expectedSha ||
    deployment.meta?.githubCommitRef !== "main"
  ) {
    throw new Error("deployment is not the READY production candidate for the release SHA");
  }
  if (requireUnaliased) {
    const aliases = Array.isArray(deployment.alias) ? deployment.alias : [];
    if (aliases.some((alias) => alias === "camnook.shop" || alias === "www.camnook.shop")) {
      throw new Error("candidate already owns a public production alias");
    }
  }
  return deployment.id;
}

function readDeployment(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("deployment response could not be parsed");
  }
}

function runCli() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "admit") {
    const releaseSha = admitRelease({
      eventName: process.env.RELEASE_EVENT_NAME,
      workflowConclusion: process.env.RELEASE_WORKFLOW_CONCLUSION,
      workflowEvent: process.env.RELEASE_WORKFLOW_EVENT,
      workflowBranch: process.env.RELEASE_WORKFLOW_BRANCH,
      workflowSha: process.env.RELEASE_WORKFLOW_SHA,
      workflowRef: process.env.RELEASE_WORKFLOW_REF,
      manualSha: process.env.RELEASE_MANUAL_SHA,
      emergencyConfirmation: process.env.RELEASE_EMERGENCY_CONFIRMATION,
      emergencyReason: process.env.RELEASE_EMERGENCY_REASON,
      ciVerified: process.env.RELEASE_CI_VERIFIED === "true",
      currentMainSha: process.env.RELEASE_CURRENT_MAIN_SHA,
    });
    process.stdout.write(`${releaseSha}\n`);
    return;
  }
  if (command === "current-main" && args.length === 2) {
    process.stdout.write(`${assertCurrentMain(args[0], args[1])}\n`);
    return;
  }
  if (command === "deployment" && args.length === 6) {
    const [path, id, sha, projectId, teamId, aliasMode] = args;
    verifyDeployment(readDeployment(path), {
      expectedId: id,
      expectedSha: sha,
      expectedProjectId: projectId,
      expectedTeamId: teamId,
      requireUnaliased: aliasMode === "unaliased",
    });
    return;
  }
  throw new Error("invalid release gate policy command");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`release gate refused: ${error.message}\n`);
    process.exitCode = 2;
  }
}
