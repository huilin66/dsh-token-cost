window.__ModuleLoader__.load({
  id: "@local/dsh-token-cost",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.tsx
var client_exports = {};
__export(client_exports, {
  MessageCost: () => MessageCost,
  NS: () => NS,
  SessionCostChip: () => SessionCostChip,
  TokenCostSection: () => TokenCostSection,
  apply: () => apply,
  default: () => client_default,
  en: () => en,
  inject: () => inject,
  zh: () => zh
});
module.exports = __toCommonJS(client_exports);
var import_react = __toESM(require("react"), 1);
var NS = "tokenCost";
var zh = {
  "header.title": "\u4F30\u7B97\u8D39\u7528",
  "header.estimate": "\u{1F4B0} \xA5{amount}",
  "header.tip": "\u4F30\u7B97\u8D39\u7528\uFF0C\u4EE5\u5B98\u65B9\u8D26\u5355\u4E3A\u51C6",
  "message.cost": "\u{1F4B0} \xA5{amount}",
  "message.tip": "\u672C\u6D88\u606F\u4F30\u7B97\u8D39\u7528\uFF0C\u4EE5\u5B98\u65B9\u8D26\u5355\u4E3A\u51C6",
  "section.nav": "\u8D39\u7528\u7EDF\u8BA1",
  "section.title": "Token \u8D39\u7528\uFF08\u4F30\u7B97\uFF09",
  "section.total": "\u603B\u8D39\u7528",
  "section.sessions": "\u4F1A\u8BDD\u6570",
  "section.noData": "\u6682\u65E0\u8D39\u7528\u6570\u636E\u3002",
  "section.model": "\u6A21\u578B",
  "section.tokens": "\u8F93\u5165 {input} \xB7 \u8F93\u51FA {output}",
  "section.cost": "\u8D39\u7528",
  "section.estimateTip": "\u4EE5\u4E0A\u5747\u4E3A\u4F30\u7B97\u8D39\u7528\uFF0C\u5B9E\u9645\u4EE5\u5B98\u65B9\u8D26\u5355\u4E3A\u51C6\u3002",
  "format.cost": "\xA5{amount}",
  "format.tokens": "{value}"
};
var en = {
  "header.title": "Est. cost",
  "header.estimate": "\u{1F4B0} ${amount}",
  "header.tip": "Estimated cost; the official bill wins.",
  "message.cost": "\u{1F4B0} ${amount}",
  "message.tip": "Estimated cost for this message; the official bill wins.",
  "section.nav": "Token cost",
  "section.title": "Token cost (estimated)",
  "section.total": "Total",
  "section.sessions": "Sessions",
  "section.noData": "No cost data yet.",
  "section.model": "Model",
  "section.tokens": "{input} in \xB7 {output} out",
  "section.cost": "Cost",
  "section.estimateTip": "All figures are estimates; the official bill wins.",
  "format.cost": "${amount}",
  "format.tokens": "{value}"
};
function roundCost(cost) {
  return Math.round(cost * 1e4) / 1e4;
}
function formatAmount(cost) {
  const rounded = roundCost(cost);
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}
function sessionCost(projectionValues) {
  const value = projectionValues?.tokenCost;
  if (value === void 0 || typeof value !== "object" || value === null) return void 0;
  return value;
}
function SessionCostChip({ useProjection, t }) {
  const cost = useProjection("tokenCost");
  const total = typeof cost === "object" && cost !== null && typeof cost.totalCost === "number" ? cost.totalCost : 0;
  if (total <= 0) return null;
  return /* @__PURE__ */ import_react.default.createElement(
    "span",
    {
      title: t("header.tip"),
      style: { whiteSpace: "nowrap", opacity: 0.85, fontVariantNumeric: "tabular-nums" }
    },
    t("header.estimate", { amount: formatAmount(total) })
  );
}
function MessageCost({ messageId, useProjection, t }) {
  const projection = useProjection("tokenCost");
  if (typeof projection !== "object" || projection === null) return null;
  const entry = projection.messageCosts?.[messageId];
  const cost = entry?.cost;
  if (typeof cost !== "number" || cost <= 0) return null;
  return /* @__PURE__ */ import_react.default.createElement(
    "span",
    {
      className: "dsh-token-cost-message",
      title: t("message.tip"),
      style: {
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
        marginLeft: 8
      }
    },
    t("message.cost", { amount: formatAmount(cost) })
  );
}
var messageCostCss = `[data-time-hover-root] .dsh-token-cost-message {
  opacity: 0;
  transition: opacity 80ms;
  order: 2;
}
[data-time-hover-root]:hover .dsh-token-cost-message,
[data-time-hover-root]:focus-within .dsh-token-cost-message {
  opacity: 1;
}`;
function injectMessageCostCss() {
  if (typeof document === "undefined") return;
  if (document.querySelector('style[data-plugin-css="dsh-token-cost/message-cost"]') !== null) return;
  const tag = document.createElement("style");
  tag.dataset.plugin = "@local/dsh-token-cost";
  tag.dataset.pluginCss = "dsh-token-cost/message-cost";
  tag.textContent = messageCostCss;
  document.head.appendChild(tag);
}
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
function TokenCostSection({ useSessions, t }) {
  const state = useSessions((s) => s);
  const rows = state ? Object.values(state.byId) : [];
  const { totalCost, sessions, byModel, currency } = aggregateCosts(rows);
  const models = Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost);
  return /* @__PURE__ */ import_react.default.createElement("div", { style: { width: "100%", maxWidth: 760, display: "flex", flexDirection: "column", gap: 16 } }, /* @__PURE__ */ import_react.default.createElement("h2", { style: { margin: 0, fontSize: 18, lineHeight: "26px" } }, t("section.title")), /* @__PURE__ */ import_react.default.createElement("div", { style: { display: "flex", gap: 24, flexWrap: "wrap" } }, /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("div", { style: { fontSize: 12, opacity: 0.65 } }, t("section.total")), /* @__PURE__ */ import_react.default.createElement("div", { style: { fontSize: 24, lineHeight: "32px", fontVariantNumeric: "tabular-nums" } }, t("format.cost", { amount: formatAmount(totalCost) }))), /* @__PURE__ */ import_react.default.createElement("div", null, /* @__PURE__ */ import_react.default.createElement("div", { style: { fontSize: 12, opacity: 0.65 } }, t("section.sessions")), /* @__PURE__ */ import_react.default.createElement("div", { style: { fontSize: 24, lineHeight: "32px", fontVariantNumeric: "tabular-nums" } }, sessions))), models.length === 0 ? /* @__PURE__ */ import_react.default.createElement("div", { style: { opacity: 0.65 } }, t("section.noData")) : /* @__PURE__ */ import_react.default.createElement("table", { style: { borderCollapse: "collapse", width: "100%", fontSize: 13 } }, /* @__PURE__ */ import_react.default.createElement("thead", null, /* @__PURE__ */ import_react.default.createElement("tr", { style: { textAlign: "left", opacity: 0.65 } }, /* @__PURE__ */ import_react.default.createElement("th", { style: { padding: "6px 8px" } }, t("section.model")), /* @__PURE__ */ import_react.default.createElement("th", { style: { padding: "6px 8px" } }, t("section.cost")), /* @__PURE__ */ import_react.default.createElement("th", { style: { padding: "6px 8px" } }, t("section.tokens")))), /* @__PURE__ */ import_react.default.createElement("tbody", null, models.map(([model, bucket]) => /* @__PURE__ */ import_react.default.createElement("tr", { key: model, style: { borderTop: "1px solid var(--dsw-alias-border-l2, #eee)" } }, /* @__PURE__ */ import_react.default.createElement("td", { style: { padding: "6px 8px", fontFamily: "var(--dsw-font-mono, monospace)" } }, model), /* @__PURE__ */ import_react.default.createElement("td", { style: { padding: "6px 8px", fontVariantNumeric: "tabular-nums" } }, t("format.cost", { amount: formatAmount(bucket.cost) })), /* @__PURE__ */ import_react.default.createElement("td", { style: { padding: "6px 8px", opacity: 0.75 } }, t("section.tokens", {
    input: t("format.tokens", { value: formatTokens(bucket.uncachedInputTokens + bucket.cacheReadTokens + bucket.cacheWriteTokens) }),
    output: t("format.tokens", { value: formatTokens(bucket.outputTokens) })
  })))))), /* @__PURE__ */ import_react.default.createElement("div", { style: { fontSize: 12, opacity: 0.5 } }, typeof currency === "string" ? currency === "CNY" ? "CNY" : currency : "", " \xB7 ", t("section.estimateTip")));
}
function formatTokens(value) {
  if (value >= 1e6) return `${trim((value / 1e6).toFixed(1))}M`;
  if (value >= 1e3) return `${trim((value / 1e3).toFixed(1))}k`;
  return String(value);
}
function trim(text) {
  return text.replace(/\.0$/, "");
}
var inject = ["slots", "locale"];
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
var client_default = { apply, inject };

    return module.exports;
  }
});

