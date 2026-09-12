import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Vite is supplied by the repository's pinned Vitest dependency.
const require = createRequire(import.meta.url);
const vitestRequire = createRequire(require.resolve("vitest/package.json"));
const { createServer } = await import(vitestRequire.resolve("vite"));
const root = fileURLToPath(new URL(".", import.meta.url));
const server = await createServer({
  configFile: false,
  root,
  resolve: { alias: [
    { find: "next/link", replacement: `${root}link.tsx` },
    { find: "../actions/quote-booking", replacement: `${root}quote.ts` },
    { find: "@", replacement: fileURLToPath(new URL("../../src", import.meta.url)) },
  ] },
  server: { host: "127.0.0.1", port: 3002, strictPort: true },
});
await server.listen();
server.printUrls();
