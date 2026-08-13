/**
 * Build the dsh-token-cost plugin.
 *
 *  - Host half: lib/index.js (ESM, bundle=false so runtime deps resolve from
 *    the profile's node_modules at load time).
 *  - Client half: lib/client.js (an IIFE that registers the bundle with the
 *    browser __ModuleLoader__, matching the shape shipped client bundles use;
 *    React and @deepseek-ai/* remain external and resolve through the loader).
 *
 * Run: node build.mjs
 */
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outdir = join(root, "lib");
mkdirSync(outdir, { recursive: true });

// Host half: bundle with every runtime dependency external (the profile
// installs the harness deps, so they resolve from node_modules at load time).
await build({
  entryPoints: [join(root, "src/index.ts")],
  outfile: join(outdir, "index.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  external: ["@deepseek-ai/*", "zod", "@deepseek-ai/schemastery"],
  sourcemap: false
});

// Client half: bundle React + plugin code into one IIFE that registers with
// the browser module loader. React, react/jsx-runtime, and @deepseek-ai/*
// stay external and resolve through __ModuleLoader__ at runtime.
const banner = `window.__ModuleLoader__.load({
  id: "dsh-token-cost",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
`;
const footer = `
    return module.exports;
  }
});
`;

await build({
  entryPoints: [join(root, "src/client.tsx")],
  outfile: join(outdir, "client.js"),
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: ["es2020"],
  external: [
    "react",
    "react/jsx-runtime",
    "@deepseek-ai/*"
  ],
  banner: { js: banner },
  footer: { js: footer },
  sourcemap: false
});

console.log("built lib/index.js and lib/client.js");
