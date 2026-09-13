import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Vite is supplied by the repository's pinned Vitest dependency.
const require = createRequire(import.meta.url);
const vitestRequire = createRequire(require.resolve("vitest/package.json"));
const { createServer } = await import(vitestRequire.resolve("vite"));
const root = fileURLToPath(new URL(".", import.meta.url));
const server = await createServer({
  configFile: false,
  // Next Image reads build-time environment flags; this standalone fixture has none.
  define: { "process.env": "{}" },
  root,
  plugins: [{
    name: "synthetic-address-lookup",
    enforce: "pre",
    resolveId(source, importer) {
      if (source === "./actions" && importer?.endsWith("/payments/payment-panel.tsx")) return `${root}payment.ts`;
      if (source === "./actions" && importer?.endsWith("/resolution/renter-resolution-status.tsx")) return `${root}resolution.ts`;
    },
    configureServer(server) {
      let failNext = true;
      server.middlewares.use((request, response, next) => {
        if (request.url === "/api/kyc/residential-geocode") {
          let body = "";
          request.on("data", (chunk) => { body += chunk; });
          request.on("end", () => {
            response.setHeader("Content-Type", "application/json");
            if (body.includes("Unavailable")) {
              response.statusCode = 503;
              response.end(JSON.stringify({ error: "Synthetic failure" }));
            } else {
              response.end(JSON.stringify({ suggestions: [{ label: "Cebu fixture result", latitude: 10.31, longitude: 123.89 }] }));
            }
          });
          return;
        }
        if (request.url === "/__usability/reset-areas") {
          failNext = true;
          response.end("Reset synthetic lookup failure");
          return;
        }
        if (!request.url?.startsWith("/api/locations/psgc")) return next();
        const parent = new URL(request.url, "http://localhost").searchParams.get("parent");
        response.setHeader("Content-Type", "application/json");
        if (parent && failNext) {
          failNext = false;
          response.statusCode = 503;
          response.end(JSON.stringify({ error: "Synthetic temporary lookup failure" }));
          return;
        }
        const choices = parent
          ? [{ code: "0702200000", name: "Cebu", type: "province", has_children: false, city_class: null }]
          : [{ code: "0700000000", name: "Region VII (Central Visayas)", type: "region", has_children: true, city_class: null }];
        response.end(JSON.stringify({ choices, release: "2026-q2" }));
      });
    },
  }],
  resolve: { alias: [
    { find: "@/features/pickup/actions", replacement: `${root}resolution.ts` },
    { find: "./handoff-actions", replacement: `${root}handoff.ts` },
    { find: "./owner-actions", replacement: `${root}camera.ts` },
    { find: "@/features/auth/actions", replacement: `${root}auth.ts` },
    { find: "@/features/bookings/actions/request-booking", replacement: `${root}request.ts` },
    { find: "next/link", replacement: `${root}link.tsx` },
    { find: "../actions/quote-booking", replacement: `${root}quote.ts` },
    { find: "@", replacement: fileURLToPath(new URL("../../src", import.meta.url)) },
  ] },
  server: { host: "127.0.0.1", port: 3002, strictPort: true },
});
await server.listen();
server.printUrls();
