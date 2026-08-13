/**
 * Token cost tracking client plugin (browser half).
 *
 * Surfaces:
 *  1. A session-header utility showing THIS session's estimated cost, read
 *     from the `tokenCost` projection via the framework `useProjection` seat.
 *     Hover explains the figure is an estimate and the official bill wins.
 *  2. A per-message cost label on every finalized assistant message's action
 *     row (the same row that shows run time / TTFT / tokens-per-second),
 *     priced client-side from that message's own usage and the projection's
 *     effective price table.
 *  3. A Settings section ("Token cost") aggregating every listed session's
 *     `projectionValues.tokenCost` into a cross-session total with a
 *     per-model breakdown — pure client-side fold over the live list store.
 *
 * The client bundle is plain React; the host loader composes it through the
 * package's `dsh.client` declaration and `exports["./client"]`.
 */
import React from "react";

/** Locale namespace owned by this plugin. */
const NS = "tokenCost";

/** Simplified Chinese dictionary (key-set source of truth). */
const zh = {
  "header.title": "估算费用",
  "header.estimate": "💰 ¥{amount}",
  "header.tip": "估算费用，以官方账单为准",
  "message.cost": "💰 ¥{amount}",
  "message.tip": "本消息估算费用，以官方账单为准",
  "section.nav": "费用统计",
  "section.title": "Token 费用（估算）",
  "section.total": "总费用",
  "section.sessions": "会话数",
  "section.noData": "暂无费用数据。",
  "section.model": "模型",
  "section.tokens": "输入 {input} · 输出 {output}",
  "section.cost": "费用",
  "section.estimateTip": "以上均为估算费用，实际以官方账单为准。",
  "format.cost": "¥{amount}",
  "format.tokens": "{value}"
};

/** English dictionary checked against the Chinese key set.
 * Currency is always CNY (the plugin prices in RMB), so the symbol is ¥ in
 * every language — only the surrounding copy is translated.
 */
const en = {
  "header.title": "Est. cost",
  "header.estimate": "💰 ¥{amount}",
  "header.tip": "Estimated cost; the official bill wins.",
  "message.cost": "💰 ¥{amount}",
  "message.tip": "Estimated cost for this message; the official bill wins.",
  "section.nav": "Token cost",
  "section.title": "Token cost (estimated)",
  "section.total": "Total",
  "section.sessions": "Sessions",
  "section.noData": "No cost data yet.",
  "section.model": "Model",
  "section.tokens": "{input} in · {output} out",
  "section.cost": "Cost",
  "section.estimateTip": "All figures are estimates; the official bill wins.",
  "format.cost": "¥{amount}",
  "format.tokens": "{value}"
};

/** Round a raw cost (already in currency units) for display. */
function roundCost(cost) {
  return Math.round(cost * 1e4) / 1e4;
}

/** Format a cost amount as a plain number string (no currency symbol). */
function formatAmount(cost) {
  const rounded = roundCost(cost);
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

/** A per-session cost snapshot, or undefined when the session has no cost row. */
function sessionCost(projectionValues) {
  const value = projectionValues?.tokenCost;
  if (value === void 0 || typeof value !== "object" || value === null) return void 0;
  return value;
}

/** The session-header utility: one compact estimated-cost chip for the current session. */
function SessionCostChip({ useProjection, t }) {
  const cost = useProjection("tokenCost");
  const total = typeof cost === "object" && cost !== null && typeof cost.totalCost === "number" ? cost.totalCost : 0;
  if (total <= 0) return null;
  return (
    <span
      title={t("header.tip")}
      style={{ whiteSpace: "nowrap", opacity: 0.85, fontVariantNumeric: "tabular-nums" }}
    >
      {t("header.estimate", { amount: formatAmount(total) })}
    </span>
  );
}

/** Per-message estimated cost label on the assistant action row.
 * Hidden by default like the time/stats line; revealed on hover/focus of the
 * enclosing `[data-time-hover-root]` (the same rule the chat uses for
 * "23:11 · 用时 44秒 · 171 tok/s").
 */
function MessageCost({ messageId, useProjection, t }) {
  const projection = useProjection("tokenCost");
  if (typeof projection !== "object" || projection === null) return null;
  const entry = projection.messageCosts?.[messageId];
  const cost = entry?.cost;
  if (typeof cost !== "number" || cost <= 0) return null;
  return (
    <span
      className="dsh-token-cost-message"
      title={t("message.tip")}
      style={{
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
        marginLeft: 8
      }}
    >
      {t("message.cost", { amount: formatAmount(cost) })}
    </span>
  );
}

/** CSS making the per-message cost behave like the chat's time/stats line:
 * invisible by default, revealed while the enclosing message row is hovered
 * or focused (the conversation shell marks that row with `data-time-hover-root`).
 * `order` pushes the cost after the action buttons ("branch in new chat"), so
 * it reads as part of the stats tail rather than an action.
 */
const messageCostCss = `[data-time-hover-root] .dsh-token-cost-message {
  opacity: 0;
  transition: opacity 80ms;
  order: 2;
}
[data-time-hover-root]:hover .dsh-token-cost-message,
[data-time-hover-root]:focus-within .dsh-token-cost-message {
  opacity: 1;
}`;

/** Inject the hover CSS once (idempotent, mirrors how client bundles ship styles). */
function injectMessageCostCss() {
  if (typeof document === "undefined") return;
  if (document.querySelector("style[data-plugin-css=\"dsh-token-cost/message-cost\"]") !== null) return;
  const tag = document.createElement("style");
  tag.dataset.plugin = "@local/dsh-token-cost";
  tag.dataset.pluginCss = "dsh-token-cost/message-cost";
  tag.textContent = messageCostCss;
  document.head.appendChild(tag);
}

/** Aggregate every listed session's cost into totals and a per-model map. */
function aggregateCosts(rows) {
  let totalCost = 0;
  let sessions = 0;
  const byModel = {};
  let currency = void 0;
  for (const row of rows) {
    const cost = sessionCost(row.projectionValues);
    if (cost === void 0) continue;
    sessions += 1;
    totalCost += typeof cost.totalCost === "number" ? cost.totalCost : 0;
    if (typeof cost.currency === "string") currency = cost.currency;
    if (typeof cost.byModel === "object" && cost.byModel !== null) {
      for (const [model, bucket] of Object.entries(cost.byModel)) {
        const prior = byModel[model];
        byModel[model] = {
          uncachedInputTokens: (prior?.uncachedInputTokens ?? 0) + (bucket.uncachedInputTokens ?? 0),
          outputTokens: (prior?.outputTokens ?? 0) + (bucket.outputTokens ?? 0),
          cacheReadTokens: (prior?.cacheReadTokens ?? 0) + (bucket.cacheReadTokens ?? 0),
          cacheWriteTokens: (prior?.cacheWriteTokens ?? 0) + (bucket.cacheWriteTokens ?? 0),
          cost: (prior?.cost ?? 0) + (bucket.cost ?? 0)
        };
      }
    }
  }
  return { totalCost, sessions, byModel, currency };
}

/** The Settings section: cross-session cost totals plus per-model breakdown. */
function TokenCostSection({ useSessions, t }) {
  const state = useSessions((s) => s);
  const rows = state ? Object.values(state.byId) : [];
  const { totalCost, sessions, byModel, currency } = aggregateCosts(rows);
  const models = Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost);
  return (
    <div style={{ width: "100%", maxWidth: 760, display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ margin: 0, fontSize: 18, lineHeight: "26px" }}>{t("section.title")}</h2>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>{t("section.total")}</div>
          <div style={{ fontSize: 24, lineHeight: "32px", fontVariantNumeric: "tabular-nums" }}>
            {t("format.cost", { amount: formatAmount(totalCost) })}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>{t("section.sessions")}</div>
          <div style={{ fontSize: 24, lineHeight: "32px", fontVariantNumeric: "tabular-nums" }}>{sessions}</div>
        </div>
      </div>
      {models.length === 0 ? (
        <div style={{ opacity: 0.65 }}>{t("section.noData")}</div>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", opacity: 0.65 }}>
              <th style={{ padding: "6px 8px" }}>{t("section.model")}</th>
              <th style={{ padding: "6px 8px" }}>{t("section.cost")}</th>
              <th style={{ padding: "6px 8px" }}>{t("section.tokens")}</th>
            </tr>
          </thead>
          <tbody>
            {models.map(([model, bucket]) => (
              <tr key={model} style={{ borderTop: "1px solid var(--dsw-alias-border-l2, #eee)" }}>
                <td style={{ padding: "6px 8px", fontFamily: "var(--dsw-font-mono, monospace)" }}>{model}</td>
                <td style={{ padding: "6px 8px", fontVariantNumeric: "tabular-nums" }}>
                  {t("format.cost", { amount: formatAmount(bucket.cost) })}
                </td>
                <td style={{ padding: "6px 8px", opacity: 0.75 }}>
                  {t("section.tokens", {
                    input: t("format.tokens", { value: formatTokens(bucket.uncachedInputTokens + bucket.cacheReadTokens + bucket.cacheWriteTokens) }),
                    output: t("format.tokens", { value: formatTokens(bucket.outputTokens) })
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ fontSize: 12, opacity: 0.5 }}>
        {typeof currency === "string" ? (currency === "CNY" ? "CNY" : currency) : ""} · {t("section.estimateTip")}
      </div>
    </div>
  );
}

/** Compact token formatting: 12.3k, 1.2M. */
function formatTokens(value) {
  if (value >= 1e6) return `${trim((value / 1e6).toFixed(1))}M`;
  if (value >= 1e3) return `${trim((value / 1e3).toFixed(1))}k`;
  return String(value);
}

function trim(text) {
  return text.replace(/\.0$/, "");
}

/** Required services for locale registration and slot contributions. */
const inject = ["slots", "locale"];

/**
 * Client plugin body: register the dictionaries, the session-header chip,
 * the per-message cost label, and the Settings section.
 * @param ctx - client root context.
 */
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "token-cost: dictionaries");
  injectMessageCostCss();
  ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
    name: "conversation.session.header.actions",
    id: "token-cost",
    order: 30,
    locale: NS
  }, SessionCostChip));
  ctx.slots.inject("conversation.chat.assistant-actions", () => ctx.slots.register({
    name: "conversation.chat.assistant-actions",
    id: "token-cost",
    order: 100,
    locale: NS
  }, MessageCost));
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "token-cost",
    order: 100,
    label: () => ctx.locale.bind(NS)("section.nav"),
    locale: NS
  }, TokenCostSection));
}

export { NS, MessageCost, SessionCostChip, TokenCostSection, apply, en, inject, zh };
export default { apply, inject };
