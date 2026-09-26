import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Keep DOM interaction checks reliable alongside development servers.
    fileParallelism: false,
    exclude: [...configDefaults.exclude, ".worktrees/**"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
