#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { evaluateLaunchReadiness, LaunchReadinessError } from "./production-launch-readiness-lib.mjs";

const DEFAULT_EVIDENCE =
  "docs/operations/production-launch-evidence-2026-08-16.json";

function parseArguments(argv) {
  const options = { evidence: DEFAULT_EVIDENCE, json: false, requireGo: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") {
      continue;
    } else if (argument === "--evidence") {
      const value = argv[index + 1];
      if (!value) throw new LaunchReadinessError("--evidence requires a path.");
      options.evidence = value;
      index += 1;
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--require-go") {
      options.requireGo = true;
    } else {
      throw new LaunchReadinessError(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const evidencePath = resolve(process.cwd(), options.evidence);
  const migrationDirectory = resolve(process.cwd(), "supabase/migrations");
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  const repositoryMigrations = (await readdir(migrationDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const result = evaluateLaunchReadiness(evidence, { repositoryMigrations });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Production launch evidence verified: ${result.auditId}`);
    console.log(`Decision: ${result.decision}`);
    console.log(
      `Migrations: Production ${result.productionMigrationCount}/${result.repositoryMigrationCount}`,
    );
    if (result.blockers.length > 0) {
      console.log("Blockers:");
      for (const blocker of result.blockers) console.log(`- ${blocker}`);
    }
  }

  if (options.requireGo && result.decision !== "GO") process.exitCode = 2;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Production launch evidence rejected: ${message}`);
  process.exitCode = 1;
});
