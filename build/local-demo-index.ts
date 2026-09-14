import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

// Production Nginx supplies directory indexes. Match that behavior for frozen
// lessons in the standalone local copy, without changing the product's URLs.
export function localDemoIndex(): Plugin {
  return {
    name: "zhijing-local-demo-index",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        const url = new URL(req.url || "/", "http://localhost");
        const match = url.pathname.match(
          /^\/(?:zhijing\/)?demo\/([a-z0-9-]+)\/$/,
        );
        if (
          match &&
          existsSync(
            resolve(server.config.publicDir, "demo", match[1], "index.html"),
          )
        ) {
          req.url = `${url.pathname}index.html${url.search}`;
        }
        next();
      });
    },
  };
}
