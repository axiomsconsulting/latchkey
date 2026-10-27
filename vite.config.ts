// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import path from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [pdfLibTslib()],
    resolve: {
      alias: {
        "entities/lib/decode.js": path.resolve(__dirname, "node_modules/entities/lib/decode.js"),
        "entities/lib/encode.js": path.resolve(__dirname, "node_modules/entities/lib/encode.js"),
        entities: path.resolve(__dirname, "node_modules/entities"),
      },
    },
  },
});

/**
 * pdf-lib (and its @pdf-lib helpers) use tslib 1.x, whose CommonJS/UMD file the
 * Workers server bundle loads as undefined: every PDF failed with "Cannot
 * destructure property '__extends'". For those packages only, use tslib's own
 * ES module file; everything else keeps tslib 2 as installed.
 */
function pdfLibTslib() {
  const esm = path.resolve(__dirname, "node_modules/tslib/tslib.es6.js");
  return {
    name: "pdf-lib-tslib",
    enforce: "pre" as const,
    resolveId(source: string, importer?: string) {
      if (
        source === "tslib" &&
        importer &&
        /[\\/]node_modules[\\/](pdf-lib|@pdf-lib)[\\/]/.test(importer)
      )
        return esm;
      return null;
    },
  };
}
