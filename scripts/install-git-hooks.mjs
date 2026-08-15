import { execFileSync } from "node:child_process";

function gitOutput(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

let repositoryRoot;
try {
  repositoryRoot = gitOutput(["rev-parse", "--show-toplevel"]);
} catch {
  // Package installation can run outside a Git checkout, such as in a
  // deployment bundle. That environment has no local hooks to configure.
  process.exit(0);
}

execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
  cwd: repositoryRoot,
  stdio: "inherit",
});
console.log("Configured Git hooks from .githooks");
