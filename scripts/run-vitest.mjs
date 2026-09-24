import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const environment = { ...process.env, TZ: "UTC" };

while (args[0] === "--env") {
  args.shift();
  const assignment = args.shift() ?? "";
  const separator = assignment.indexOf("=");
  if (separator < 1) {
    process.stderr.write("run-vitest: expected --env NAME=VALUE\n");
    process.exit(2);
  }
  environment[assignment.slice(0, separator)] = assignment.slice(separator + 1);
}
if (args[0] === "--") args.shift();

const result = spawnSync(
  process.execPath,
  [resolve(repositoryRoot, "node_modules/vitest/vitest.mjs"), ...args],
  { cwd: repositoryRoot, env: environment, stdio: "inherit" },
);
if (result.error) {
  process.stderr.write(`run-vitest: ${result.error.message}\n`);
  process.exit(1);
}
process.exit(result.status ?? 1);
