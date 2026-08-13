// src/index.ts
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z as zod } from "zod";
import z from "@deepseek-ai/schemastery";
var DEFAULT_PRICES = {
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
var projectionSchema = zod.object({
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
function priceUsage(price, usage) {
  const inputPerM = price?.inputPerM ?? 0;
  const outputPerM = price?.outputPerM ?? 0;
  const cacheReadPerM = price?.cacheReadPerM ?? 0;
  const cacheWritePerM = price?.cacheWritePerM ?? 0;
  return (usage.inputTokens * inputPerM + usage.outputTokens * outputPerM + (usage.cacheReadTokens ?? 0) * cacheReadPerM + (usage.cacheWriteTokens ?? 0) * cacheWritePerM) / 1e6;
}
function resolvePrice(prices, provider, model) {
  const exact = prices[`${provider}/${model}`];
  if (exact !== void 0) return exact;
  const bare = prices[model];
  if (bare !== void 0) return bare;
  return DEFAULT_PRICES[model];
}
function createTokenCostProjection(prices, currency) {
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
        const provider2 = config.provider;
        const model2 = config.model;
        if (typeof provider2 !== "string" || typeof model2 !== "string" || provider2.length === 0 || model2.length === 0) return state;
        if (state.provider === provider2 && state.model === model2) return state;
        return { ...state, provider: provider2, model: model2 };
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
      const provider = state.provider;
      const model = state.model;
      const modelKey = typeof provider === "string" && typeof model === "string" ? `${provider}/${model}` : model ?? "unknown";
      const price = resolvePrice(prices, provider ?? "", model ?? "");
      const cost = priceUsage(price, usage);
      const buckets = {
        uncachedInputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens ?? 0,
        cacheWriteTokens: usage.cacheWriteTokens ?? 0
      };
      const previous = state.last !== null && state.last.turn === turn && state.last.step === step ? state.last.buckets : void 0;
      const previousCost = previous === void 0 ? 0 : priceUsage(price, {
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
        ...messageId !== void 0 ? {
          messageCosts: {
            ...state.messageCosts,
            [messageId]: {
              provider,
              model,
              cost
            }
          }
        } : {}
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
var Config = z.object({
  currency: z.string().default("CNY"),
  prices: z.dict(z.object({
    inputPerM: z.number(),
    outputPerM: z.number(),
    cacheReadPerM: z.number(),
    cacheWritePerM: z.number()
  })).default({}),
  pricesDir: z.string()
});
function mergePrices(base, overlay) {
  const merged = { ...base };
  if (typeof overlay !== "object" || overlay === null) return merged;
  for (const [model, price] of Object.entries(overlay)) {
    if (typeof price !== "object" || price === null) continue;
    merged[model] = {
      inputPerM: typeof price.inputPerM === "number" ? price.inputPerM : 0,
      outputPerM: typeof price.outputPerM === "number" ? price.outputPerM : 0,
      ...typeof price.cacheReadPerM === "number" ? { cacheReadPerM: price.cacheReadPerM } : {},
      ...typeof price.cacheWritePerM === "number" ? { cacheWritePerM: price.cacheWritePerM } : {}
    };
  }
  return merged;
}
function defaultPricesDir() {
  const home = process.env.DSH_HOME || join(homedir(), ".dsh");
  return join(home, "prices");
}
function readPricesFile(dir, name2) {
  try {
    const text = readFileSync(join(dir, name2), "utf8");
    const data = JSON.parse(text);
    return data?.prices ?? data;
  } catch {
    return void 0;
  }
}
function resolveEffectivePrices(config) {
  const dir = config.pricesDir ?? defaultPricesDir();
  const official = readPricesFile(dir, "official-prices.json");
  const local = readPricesFile(dir, "local-prices.json");
  return mergePrices(mergePrices(DEFAULT_PRICES, official), mergePrices(local, config.prices ?? {}));
}
var name = "token-cost";
var inject = ["sessionProjections"];
function apply(ctx, config) {
  const prices = resolveEffectivePrices(config);
  ctx.sessionProjections.register(createTokenCostProjection(prices, config.currency ?? "CNY"));
}
var plugin = { apply, inject, name, Config };
var index_default = plugin;
export {
  DEFAULT_PRICES,
  apply,
  createTokenCostProjection,
  index_default as default,
  inject,
  name
};
