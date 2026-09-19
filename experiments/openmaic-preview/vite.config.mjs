import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/postcss";
import { fileURLToPath } from "node:url";
import { editionPaths } from "./paths.mjs";

const edition = editionPaths();

export default defineConfig({
  base: "./",
  define: {
    "process.env.NEXT_PUBLIC_BASE_PATH": JSON.stringify(
      process.env.NEXT_PUBLIC_BASE_PATH || "/zhijing",
    ),
  },
  publicDir: fileURLToPath(new URL("public/", edition.root)),
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@lesson": fileURLToPath(new URL("lesson.json", edition.root)),
      "@timing": fileURLToPath(new URL("timing.json", edition.root)),
    },
  },
  css: { postcss: { plugins: [tailwindcss()] } },
  build: {
    outDir: edition.outDir,
    emptyOutDir: true,
  },
});
