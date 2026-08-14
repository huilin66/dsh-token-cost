#!/usr/bin/env node
/**
 * One-command installer for dsh-token-cost.
 *
 *   npx dsh-token-cost setup            # install into the default web profile
 *   npx dsh-token-cost setup --profile tui
 *   npx dsh-token-cost setup --profile web --prices-dir D:\custom\prices
 *
 * What it does (idempotent, safe to re-run):
 *   1. Locate the dsh profile directory ($DSH_HOME/profiles/<name>, default
 *      ~/.dsh/profiles/web).
 *   2. Install this package into the profile via pnpm (enabling pnpm through
 *      corepack when it is missing) — the same operation `dsh plugin --profile
 *      <name> add dsh-token-cost` performs, without requiring dsh or pnpm on
 *      PATH.
 *   3. Append the loader patch row to the profile's cordis.patch.yml exactly
 *      once (idempotent), preserving any existing rows and comments.
 *   4. Print the next step: restart `dsh web` and hard-refresh the browser.
 */
const { execFileSync } = require("node:child_process");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { homedir } = require("node:os");
const { join, resolve } = require("node:path");
const { normalizePatchContent } = require("./patch-utils.cjs");

const PACKAGE_NAME = "dsh-token-cost";
const PLUGIN_ID = "token-cost";

function parseArgs(argv) {
  const args = { profile: "web", pricesDir: void 0 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--profile") args.profile = argv[++i];
    else if (arg === "--prices-dir") args.pricesDir = argv[++i];
    else if (arg === "--help" || arg === "-h") args.help = true;
  }
  return args;
}

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

function profileDir(name) {
  return join(dshHome(), "profiles", name);
}

/** Run a command, throwing with stderr on failure. */
function run(command, args, cwd) {
  try {
    return execFileSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  } catch (error) {
    throw new Error(`${command} ${args.join(" ")} failed: ${error.stderr ?? error.message}`);
  }
}

/** Ensure pnpm is usable: prefer PATH, else corepack. Returns the command name. */
function pnpmCommand() {
  try {
    execFileSync("pnpm", ["--version"], { stdio: "ignore" });
    return "pnpm";
  } catch {
    // corepack shim
    return "corepack";
  }
}

/** Idempotently append the loader patch row to cordis.patch.yml. */
function ensurePatchRow(dir) {
  const patchPath = join(dir, "cordis.patch.yml");
  const row = [
    "",
    "# dsh-token-cost: token cost tracking (installed by `dsh-token-cost setup`).",
    "# Prices come from <pricesDir>/official-prices.json (daily sync) and",
    "# <pricesDir>/local-prices.json (optional overrides); see the package README.",
    "- insert:",
    "    - id: " + PLUGIN_ID,
    "      name: '" + PACKAGE_NAME + "'",
    "      config:",
    "        currency: CNY",
    "        prices: {}"
  ].join("\n");

  const originalContent = existsSync(patchPath) ? readFileSync(patchPath, "utf8") : "";
  let content = normalizePatchContent(originalContent);
  if (content.includes("- id: " + PLUGIN_ID)) {
    if (content !== originalContent) writeFileSync(patchPath, content, "utf8");
    return false; // already installed; normalized an old malformed overlay if needed
  }
  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  writeFileSync(patchPath, content + separator + row + "\n", "utf8");
  return true;
}

/** Ensure the default prices directory exists. */
function ensurePricesDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(`dsh-token-cost setup — one-command install for the dsh-token-cost plugin

Usage:
  npx dsh-token-cost setup [--profile web] [--prices-dir <dir>]

Steps performed:
  1. install this package into $DSH_HOME/profiles/<profile> via pnpm (corepack shim used when pnpm is absent)
  2. append the loader patch row to cordis.patch.yml (idempotent)
  3. create the prices directory (default $DSH_HOME/prices) for official/local price JSON
  4. remind you to restart dsh web`);
  process.exit(0);
}

const dir = profileDir(args.profile);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
if (!existsSync(join(dir, "package.json"))) {
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name: `dsh-profile-${args.profile}`,
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"] } }
  }, null, 2) + "\n", "utf8");
}

const pnpm = pnpmCommand();
console.log(`installing ${PACKAGE_NAME} into profile "${args.profile}" (${dir}) via ${pnpm}...`);
const pnpmArgs = pnpm === "corepack" ? ["pnpm", "add", PACKAGE_NAME] : ["add", PACKAGE_NAME];
run(pnpm, pnpmArgs, dir);

const added = ensurePatchRow(dir);
const pricesDir = args.pricesDir || join(dshHome(), "prices");
ensurePricesDir(pricesDir);

console.log(added ? "patch row added to cordis.patch.yml" : "cordis.patch.yml already configured (no change)");
console.log(`prices directory: ${pricesDir}`);
console.log("");
console.log("Done. Restart dsh web and hard-refresh the browser (Ctrl+Shift+R):");
console.log("  npx @deepseek-ai/dsh web");
console.log("");
console.log("Then sync official prices once (or wait for the daily task):");
console.log("  dsh-token-cost update");
