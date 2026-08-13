# dsh-token-cost

English | [中文](README.zh.md)

Token cost tracking plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

- **Per-session cost** shown in the session header: `💰 ¥1.48` (hover tooltip notes it is an estimate and the official bill wins)
- **Per-message cost** on every assistant message's action row, revealed on hover together with the run-time stats line
- **Settings → Token cost**: cross-session totals with a per-model breakdown
- Prices priced per-million-token from **official DeepSeek prices, synced automatically by a daily script**

## Installation

### One command (recommended — no pnpm required)

```powershell
npx dsh-token-cost setup
```

This installs the plugin into your `web` profile (enabling pnpm through corepack when missing), appends the `cordis.patch.yml` row, and creates the prices directory. Re-running is safe (idempotent).

For another profile (e.g. `tui`):

```powershell
npx dsh-token-cost setup --profile tui
```

### Via dsh (requires pnpm)

```powershell
# in your dsh profile directory (e.g. ~/.dsh/profiles/web)
cd ~/.dsh/profiles/web
dsh plugin --profile web add dsh-token-cost
```

Then add to your profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: token-cost
      name: 'dsh-token-cost'
      config:
        currency: CNY
```

Restart `dsh web` and hard-refresh the browser.

## Price updates

Only **two** price sources, both plain JSON files under `~/.dsh/prices/` (or `$DSH_HOME/prices/`):

| File | Who maintains it | Priority |
|---|---|---|
| `official-prices.json` | **The daily script** — do not hand-edit | lower |
| `local-prices.json` | **You** — optional overrides | higher |

Effective price per model: `local-prices.json` > `official-prices.json` > built-in defaults. Restart `dsh web` after a change (the projection replays the log with the new prices).

### Daily automatic sync (recommended)

The `dsh-token-cost-update` script fetches DeepSeek's official pricing page, parses the current prices, and rewrites `official-prices.json`:

```powershell
# one-time run
npx dsh-token-cost-update

# or via the installed binary
dsh-token-cost-update
```

Run it once a day via Windows Task Scheduler:

```powershell
$action = New-ScheduledTaskAction -Execute (Get-Command node).Source -Argument "`"$(npm root -g)/dsh-token-cost/update-prices.mjs`""
$trigger = New-ScheduledTaskTrigger -Daily -At '09:30'
Register-ScheduledTask -TaskName 'DSH-TokenCost-UpdatePrices' -Action $action -Trigger $trigger -Force
```

The script is safe to run at any time: on any fetch/parse failure it exits non-zero **without touching** the existing file, so a transient network problem never destroys the last good price table. It prints `prices changed: true/false` so you can detect official price movements in a log.

### Manual local overrides

Create `~/.dsh/prices/local-prices.json`:

```json
{
  "prices": {
    "deepseek-v4-flash": { "inputPerM": 1.5, "outputPerM": 3, "cacheReadPerM": 0.03 }
  }
}
```

The shape is `{ "prices": { "<modelId>": { "inputPerM", "outputPerM", "cacheReadPerM?", "cacheWritePerM?" } } }`. Unknown models price at zero and still accumulate token counts.

## How it works

- A host projection unit (`tokenCost`) folds the durable session log: `request/header` events track the route (`provider/model`), `assistant/message` usage is priced per model, and per-message costs are recorded keyed by message id.
- The projection rides the standard session-projection seam (registry snapshot, change feed, `session.list` baselines), so the browser renders everything with zero extra RPCs.
- Built-in defaults keep the plugin usable with no configuration; DeepSeek's current official prices (as of 2026-08) are included.

## License

MIT
