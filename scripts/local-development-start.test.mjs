import { afterEach, expect, test, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { startDevelopmentServer } from "./local-development.mjs";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

const require = createRequire(import.meta.url);
afterEach(() => vi.resetAllMocks());

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
