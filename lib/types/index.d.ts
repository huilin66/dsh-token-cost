/**
 * Type outlet for the dsh-token-cost plugin.
 *
 * Re-exports the projection vocabulary and merges `tokenCost` into the
 * session-projection type table, so host and client aggregates see the key
 * through the standard seam without importing each other.
 *
 * @module dsh-token-cost
 */
import type { SessionProjectionMap } from "@deepseek-ai/dsh-session-projection/types";

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
  /** Per-message costs keyed by the finalized assistant message id. */
  messageCosts: Record<string, MessageCostEntry>;
  /** Effective per-model price table (built-ins merged with user overrides), keyed by model id. */
  prices: Record<string, ModelPrice>;
}

/** One finalized assistant message's priced cost and the route that ran it. */
export interface MessageCostEntry {
  provider: string;
  model: string;
  cost: number;
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

declare module "@deepseek-ai/dsh-session-projection/types" {
  interface SessionProjectionMap {
    /** Per-model token cost accumulated across the complete durable log. */
    tokenCost: TokenCostProjection;
  }
}

export type { SessionProjectionMap };
