#!/usr/bin/env node
/**
 * DeepSeek official price synchronizer for the dsh-token-cost plugin.
 *
 * Fetches the official pricing page, parses the current (non-peak) per-million
 * token prices, and writes `~/.dsh/prices/official-prices.json` for the plugin
 * to read. Designed to run once a day (Windows Task Scheduler / cron):
 *
 *   node update-prices.mjs            # default home (~/.dsh)
 *   node update-prices.mjs --home D:\some\dsh-home
 *   node update-prices.mjs --out D:\path\official-prices.json
 *
 * The script is intentionally small and dependency-free (Node 22+ global
 * fetch). On any fetch/parse failure it exits non-zero WITHOUT touching the
 * existing file, so a transient network problem never destroys the last good
 * price table.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const PRICING_URL = "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/";

/** Strip HTML tags and normalize whitespace in a cell. */
function cellText(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse "0.02元" (or "¥0.02", "2元", "1.5元") to a number; NaN on failure. */
function parseCny(text) {
  const m = String(text).match(/(\d+(?:\.\d+)?)\s*元/);
  return m === null ? NaN : Number.parseFloat(m[1]);
}

/**
 * Parse the current-price block from the official page HTML.
 * @returns {{ fetchedAt: string, currency: string, prices: Record<string, {inputPerM, outputPerM, cacheReadPerM}> }}
 * @throws on any structural mismatch — the caller keeps the previous file.
 */
function parsePricing(html) {
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => cellText(c[1]))
  );

  // Row 0: model header ("模型", "deepseek-v4-flash", "deepseek-v4-pro").
  const header = rows.find((cells) => cells[0] === "模型" && cells.length >= 3 && cells[1] !== "百万tokens输入（缓存命中）");
  if (!header) throw new Error("pricing page: model header row not found");
  const models = header.slice(1).filter(Boolean);
  if (models.length === 0) throw new Error("pricing page: no models parsed");

  // Price rows are shaped [label, flash, pro] (no model column). The cache-hit
  // row is the first child of the "价格(1)" rowspan, so its label sits at index
  // 1 and prices follow at index 2.
  const priceRow = (label, labelIndex = 0) => {
    const cells = rows.find((r) => r[labelIndex] === label && r.length >= labelIndex + models.length + 1);
    if (!cells) throw new Error(`pricing page: row "${label}" missing or short`);
    return cells;
  };
  const inputCells = priceRow("百万tokens输入（缓存未命中）");
  const outputCells = priceRow("百万tokens输出");
  const cacheReadCells = priceRow("百万tokens输入（缓存命中）", 1);

  const prices = {};
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const inputPerM = parseCny(inputCells[i + 1]);
    const outputPerM = parseCny(outputCells[i + 1]);
    const cacheReadPerM = parseCny(cacheReadCells[i + 2]);
    if (!Number.isFinite(inputPerM) || !Number.isFinite(outputPerM) || !Number.isFinite(cacheReadPerM)) {
      throw new Error(`pricing page: unparseable price for ${model}`);
    }
    prices[model] = { inputPerM, outputPerM, cacheReadPerM };
  }
  return {
    fetchedAt: new Date().toISOString(),
    currency: "CNY",
    source: PRICING_URL,
    prices
  };
}

function defaultHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

const args = process.argv.slice(2);
function flagValue(name) {
  const at = args.indexOf(name);
  return at === -1 ? void 0 : args[at + 1];
}

const home = resolve(flagValue("--home") || defaultHome());
const out = resolve(flagValue("--out") || join(home, "prices", "official-prices.json"));

const response = await fetch(PRICING_URL);
if (!response.ok) throw new Error(`pricing page: HTTP ${response.status}`);
const html = await response.text();
const parsed = parsePricing(html);

mkdirSync(dirname(out), { recursive: true });
const previous = (() => {
  try { return JSON.parse(readFileSync(out, "utf8")); } catch { return null; }
})();
const changed = JSON.stringify(previous?.prices) !== JSON.stringify(parsed.prices);
writeFileSync(out, JSON.stringify(parsed, null, 2) + "\n", "utf8");

console.log(`wrote ${out}`);
console.log(`prices changed: ${changed}`);
for (const [model, price] of Object.entries(parsed.prices)) {
  console.log(`  ${model}: in ${price.inputPerM} / cache-hit ${price.cacheReadPerM} / out ${price.outputPerM}`);
}
