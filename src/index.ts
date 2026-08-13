/**
 * Token cost tracking host plugin.
 *
 * Registers the `tokenCost` session-projection unit: a pure fold over the
 * durable session log that prices provider-reported usage with a per-model
 * price table. The projection rides the standard session-projection seam
 * (registry snapshot, change feed, list baselines), so the browser client
 * renders per-session and cross-session figures without any RPC of its own.
 *
 * The price table ships with DeepSeek's official per-million-token prices
 * (CNY) and is overridable per model; unknown models price at zero and still
 * accumulate token buckets, so the projection remains usable before a price
 * is configured.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z as zod } from "zod";
import z from "@deepseek-ai/schemastery";

/** One model's per-million-token prices in the configured currency. */
export interface ModelPrice {
  /** Un-cached input tokens (cache miss). */
  inputPerM: number;
  /** Output tokens. */
  outputPerM: number;
  /** Cache-read (cache hit) input tokens; defaults to 0. */
  cacheReadPerM?: number;
  /** Cache-write input tokens; defaults to 0. */
  cacheWritePerM?: number;
}

/** The `tokenCost` projection view: per-model buckets plus a whole-log total. */
export interface TokenCostProjection {
  /** ISO 4217 currency code the prices are denominated in. */
  currency: string;
  /** Whole-log cost = sum of every model's `cost`. */
  totalCost: number;
  /** Per-model buckets keyed by `provider/model` (falling back to bare model id). */
  byModel: Record<string, ModelCostBucket>;
  /**
   * Effective per-model price table (built-ins merged with user overrides),
   * keyed by model id. Served so browser surfaces can price single messages
   * client-side with the exact table the host fold used.
   */
  prices: Record<string, ModelPrice>;
}

/** One model's accumulated usage and cost. */
export interface ModelCostBucket {
  uncachedInputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Priced cost of this model's tokens. */
  cost: number;
}

/** Built-in DeepSeek official prices (CNY per million tokens), current before 2026-08-17. */
const DEFAULT_PRICES: Record<string, ModelPrice> = {
  "deepseek-v4-flash": {
    inputPerM: 1,
    outputPerM: 2,
    cacheReadPerM: 0.02,
    cacheWritePerM: 0
  },
  "deepseek-v4-pro": {
    inputPerM: 3,
    outputPerM: 6,
    cacheReadPerM: 0.025,
    cacheWritePerM: 0
  }
};

const projectionSchema = zod.object({
  currency: zod.string(),
  totalCost: zod.number().nonnegative(),
  byModel: zod.record(zod.object({
    uncachedInputTokens: zod.number().int().nonnegative(),
    outputTokens: zod.number().int().nonnegative(),
    cacheReadTokens: zod.number().int().nonnegative(),
    cacheWriteTokens: zod.number().int().nonnegative(),
    cost: zod.number().nonnegative()
  }).strict()),
  messageCosts: zod.record(zod.object({
    provider: zod.string(),
    model: zod.string(),
    cost: zod.number().nonnegative()
  }).strict()),
  prices: zod.record(zod.object({
    inputPerM: zod.number(),
    outputPerM: zod.number(),
    cacheReadPerM: zod.number().optional(),
    cacheWritePerM: zod.number().optional()
  }).strict())
}).strict();

/** Price one usage record against one model's table (usage carries the wire bucket shape). */
function priceUsage(price, usage) {
  const inputPerM = price?.inputPerM ?? 0;
  const outputPerM = price?.outputPerM ?? 0;
  const cacheReadPerM = price?.cacheReadPerM ?? 0;
  const cacheWritePerM = price?.cacheWritePerM ?? 0;
  return (
    usage.inputTokens * inputPerM
    + usage.outputTokens * outputPerM
    + (usage.cacheReadTokens ?? 0) * cacheReadPerM
    + (usage.cacheWriteTokens ?? 0) * cacheWritePerM
  ) / 1e6;
}

/** Resolve the price entry for one resolved route, preferring exact provider/model then bare model id. */
function resolvePrice(prices, provider, model) {
  const exact = prices[`${provider}/${model}`];
  if (exact !== void 0) return exact;
  const bare = prices[model];
  if (bare !== void 0) return bare;
  return DEFAULT_PRICES[model];
}

/**
 * Build the `tokenCost` projection unit for one price table.
 *
 * The unit is a pure fold: state stays bounded (per-model buckets plus one
 * last-sample slot), events are committed log records, and the view emits the
 * per-model buckets plus the whole-log total. Provider usage is read from the
 * same sources token-meter reads (`assistant/chunk` usage chunks and final
 * `assistant/message` usage), so a failed request's early sample is counted
 * and a final message replaces — never double-counts — that sample. The route
 * (`provider/model`) is tracked from `request/header` snapshots, so a model
 * switch mid-session prices each step under the route it actually ran.
 */
function createTokenCostProjection(prices, currency) {
  // Effective table served to browser surfaces: built-ins merged with the
  // user's overlay, so per-message client-side pricing uses the same prices
  // the host fold does. `resolvePrice` already falls back to DEFAULT_PRICES,
  // but the served table must be self-contained for client-side pricing.
  const effectivePrices = { ...DEFAULT_PRICES, ...prices };
  return {
    key: "tokenCost",
    schema: projectionSchema,
    init: () => ({
      provider: void 0,
      model: void 0,
      byModel: {},
      messageCosts: {},
      last: null
    }),
    apply: (state, event) => {
      if (event.type === "request/header") {
        const config = event.data.header.config;
        if (typeof config !== "object" || config === null) return state;
        const provider = config.provider;
        const model = config.model;
        if (typeof provider !== "string" || typeof model !== "string" || provider.length === 0 || model.length === 0) return state;
        if (state.provider === provider && state.model === model) return state;
        return { ...state, provider, model };
      }
      let turn;
      let step;
      let usage;
      let messageId;
      if (event.type === "assistant/chunk" && event.data.chunk.type === "usage") {
        turn = event.data.turn;
        step = event.data.step;
        usage = event.data.chunk.usage;
      } else if (event.type === "assistant/message" && event.data.usage !== void 0) {
        turn = event.data.turn;
        step = event.data.step;
        usage = event.data.usage;
        messageId = event.data.message?.id;
      } else {
        return state;
      }
      // Provider usage exists: find the route this step ran under.
      const provider = state.provider;
      const model = state.model;
      const modelKey = typeof provider === "string" && typeof model === "string"
        ? `${provider}/${model}`
        : model ?? "unknown";
      const price = resolvePrice(prices, provider ?? "", model ?? "");
      const cost = priceUsage(price, usage);
      const buckets = {
        uncachedInputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens ?? 0,
        cacheWriteTokens: usage.cacheWriteTokens ?? 0
      };
      const previous = state.last !== null && state.last.turn === turn && state.last.step === step
        ? state.last.buckets
        : void 0;
      const previousCost = previous === void 0
        ? 0
        : priceUsage(price, {
            inputTokens: previous.uncachedInputTokens,
            outputTokens: previous.outputTokens,
            cacheReadTokens: previous.cacheReadTokens,
            cacheWriteTokens: previous.cacheWriteTokens
          });
      const prior = state.byModel[modelKey];
      const nextBucket = {
        uncachedInputTokens: (prior?.uncachedInputTokens ?? 0) - (previous?.uncachedInputTokens ?? 0) + buckets.uncachedInputTokens,
        outputTokens: (prior?.outputTokens ?? 0) - (previous?.outputTokens ?? 0) + buckets.outputTokens,
        cacheReadTokens: (prior?.cacheReadTokens ?? 0) - (previous?.cacheReadTokens ?? 0) + buckets.cacheReadTokens,
        cacheWriteTokens: (prior?.cacheWriteTokens ?? 0) - (previous?.cacheWriteTokens ?? 0) + buckets.cacheWriteTokens,
        cost: Math.max(0, (prior?.cost ?? 0) - previousCost + cost)
      };
      return {
        ...state,
        last: {
          turn,
          step,
          buckets
        },
        byModel: {
          ...state.byModel,
          [modelKey]: nextBucket
        },
        ...(messageId !== void 0
          ? {
              messageCosts: {
                ...state.messageCosts,
                [messageId]: {
                  provider,
                  model,
                  cost
                }
              }
            }
          : {})
      };
    },
    view: (state) => {
      let totalCost = 0;
      const byModel = {};
      for (const [key, bucket] of Object.entries(state.byModel)) {
        byModel[key] = {
          uncachedInputTokens: bucket.uncachedInputTokens,
          outputTokens: bucket.outputTokens,
          cacheReadTokens: bucket.cacheReadTokens,
          cacheWriteTokens: bucket.cacheWriteTokens,
          cost: bucket.cost
        };
        totalCost += bucket.cost;
      }
      return {
        currency,
        totalCost,
        byModel,
        messageCosts: state.messageCosts,
        prices: effectivePrices
      };
    },
    stateVersion: 2
  };
}

/** Plugin configuration: currency plus an optional prices directory.
 *
 * Two price sources, both plain JSON files (see update-prices.mjs):
 *   <pricesDir>/official-prices.json  — synced from DeepSeek's site by the
 *                                        daily script; do not hand-edit.
 *   <pricesDir>/local-prices.json     — your own overrides; wins over official.
 * Built-in defaults apply when no file exists, so the plugin works out of the
 * box. `prices` (inline config) still wins over everything for deployments
 * that prefer YAML-only setup.
 */
const Config = z.object({
  currency: z.string().default("CNY"),
  prices: z.dict(z.object({
    inputPerM: z.number(),
    outputPerM: z.number(),
    cacheReadPerM: z.number(),
    cacheWritePerM: z.number()
  })).default({}),
  pricesDir: z.string()
});

/** Merge a price overlay over a base table (overlay wins per model). */
function mergePrices(base, overlay) {
  const merged = { ...base };
  if (typeof overlay !== "object" || overlay === null) return merged;
  for (const [model, price] of Object.entries(overlay)) {
    if (typeof price !== "object" || price === null) continue;
    merged[model] = {
      inputPerM: typeof price.inputPerM === "number" ? price.inputPerM : 0,
      outputPerM: typeof price.outputPerM === "number" ? price.outputPerM : 0,
      ...(typeof price.cacheReadPerM === "number" ? { cacheReadPerM: price.cacheReadPerM } : {}),
      ...(typeof price.cacheWritePerM === "number" ? { cacheWritePerM: price.cacheWritePerM } : {})
    };
  }
  return merged;
}

/** Default prices directory: $DSH_HOME/prices, else ~/.dsh/prices. */
function defaultPricesDir() {
  const home = process.env.DSH_HOME || join(homedir(), ".dsh");
  return join(home, "prices");
}

/** Read one optional price JSON file; undefined when absent or malformed. */
function readPricesFile(dir, name) {
  try {
    const text = readFileSync(join(dir, name), "utf8");
    const data = JSON.parse(text);
    return data?.prices ?? data;
  } catch {
    return void 0;
  }
}

/**
 * Resolve the effective price table:
 *   inline `prices` config > local-prices.json > official-prices.json > built-ins.
 * File reads are fail-soft: a missing or malformed file is skipped, never a
 * startup error — the built-in DeepSeek table keeps the plugin usable.
 */
function resolveEffectivePrices(config) {
  const dir = config.pricesDir ?? defaultPricesDir();
  const official = readPricesFile(dir, "official-prices.json");
  const local = readPricesFile(dir, "local-prices.json");
  return mergePrices(mergePrices(DEFAULT_PRICES, official), mergePrices(local, config.prices ?? {}));
}

/** Cordis plugin name. */
const name = "token-cost";

/** The projection registry is the plugin's whole purpose; without it the fiber stays pending. */
const inject = ["sessionProjections"];

/**
 * Register the `tokenCost` unit with the effective price table (official
 * prices file + optional local overrides, per {@link resolveEffectivePrices}).
 * @param ctx - registrant context carrying the projection registry.
 * @param config - parsed plugin configuration.
 */
function apply(ctx, config) {
  const prices = resolveEffectivePrices(config);
  ctx.sessionProjections.register(createTokenCostProjection(prices, config.currency ?? "CNY"));
}

const plugin = { apply, inject, name, Config };

export {
  DEFAULT_PRICES,
  apply,
  createTokenCostProjection,
  inject,
  name
};
export default plugin;
