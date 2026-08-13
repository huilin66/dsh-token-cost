#!/usr/bin/env node
/**
 * dsh-token-cost CLI.
 *
 *   dsh-token-cost setup             one-command install into the web profile
 *   dsh-token-cost update            sync official prices now (daily task uses this)
 *   dsh-token-cost help
 */
const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { dirname, join } = require("node:path");

const [command, ...rest] = process.argv.slice(2);

if (command === "update") {
  // Re-run the price synchronizer via its ESM entry (also reachable as
  // `node update-prices.mjs`). Forward all extra args and the exit code.
  const script = join(__dirname, "..", "update-prices.mjs");
  if (!existsSync(script)) {
    console.error("dsh-token-cost: update-prices.mjs not found next to the package");
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [script, ...rest], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

if (command === "setup" || command === "install") {
  // Delegate to the setup implementation.
  const setup = join(__dirname, "setup.cjs");
  const result = spawnSync(process.execPath, [setup, ...rest], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

console.log(`dsh-token-cost — token cost tracking for DeepSeek Harness

Usage:
  dsh-token-cost setup              install the plugin into the web profile (one command)
  dsh-token-cost update             sync official DeepSeek prices now
  dsh-token-cost help               show this help

See the package README for configuration and the daily price-sync task.`);
