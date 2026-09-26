import { afterEach, expect, test, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pullDevelopmentEnvironment, startDevelopmentServer } from "./local-development.mjs";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

const require = createRequire(import.meta.url);
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

test("starts the installed Next CLI with the current Node runtime without a package-manager shim", () => {
  vi.mocked(spawnSync).mockReturnValue({ status: 0 });
  expect(startDevelopmentServer()).toBe(0);
  expect(spawnSync).toHaveBeenCalledWith(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3000"],
    { stdio: "inherit", env: process.env },
  );
});

test("reports a spawn failure instead of silently exiting", () => {
  vi.mocked(spawnSync).mockReturnValue({ status: null, error: new Error("spawn failed") });
  expect(() => startDevelopmentServer()).toThrow("Could not start the local Next.js server: spawn failed");
});

test("preserves a server failure exit code and fails when terminated by a signal", () => {
  vi.mocked(spawnSync).mockReturnValueOnce({ status: 2 }).mockReturnValueOnce({ status: null, signal: "SIGTERM" });
  expect(startDevelopmentServer()).toBe(2);
  expect(startDevelopmentServer()).toBe(1);
});

test("pulls Development configuration through the invoking pnpm entry point on paths with spaces", () => {
  vi.stubEnv("npm_execpath", "C:/Program Files/pnpm/pnpm.cjs");
  vi.mocked(spawnSync).mockReturnValue({ status: 0 });
  pullDevelopmentEnvironment(".vercel/local-development/downloaded.env");
  expect(spawnSync).toHaveBeenCalledWith(process.execPath, [
    "C:/Program Files/pnpm/pnpm.cjs", "dlx", "vercel@59.23.2", "env", "pull",
    ".vercel/local-development/downloaded.env", "--environment=development", "--yes",
  ], { stdio: "inherit" });
});

test("gives an actionable instruction when setup is run without a package manager", () => {
  vi.stubEnv("npm_execpath", "");
  expect(() => pullDevelopmentEnvironment("unused.env")).toThrow("Run pnpm dev:setup");
  expect(spawnSync).not.toHaveBeenCalled();
});

test("stops setup when the configuration download fails", () => {
  vi.stubEnv("npm_execpath", "/tools/pnpm.cjs");
  vi.mocked(spawnSync).mockReturnValueOnce({ status: 1 }).mockReturnValueOnce({ status: null, error: new Error("unavailable") });
  expect(() => pullDevelopmentEnvironment("unused.env")).toThrow("Could not pull Development configuration");
  expect(() => pullDevelopmentEnvironment("unused.env")).toThrow("Could not pull Development configuration");
});
