# dsh-token-cost

[English](README.md) | 中文

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 开发的 Token 费用统计插件。

- **会话总费用**：会话头部显示 `💰 ¥1.48`（悬停提示"估算费用，以官方账单为准"）
- **每条消息费用**：每条 assistant 消息的动作行上，与"用时 · 首 token · tok/s"统计信息一样，**鼠标悬停才显示**
- **设置 → 费用统计**：跨会话总费用 + 按模型分列
- 价格按每百万 token 计价，来自 **DeepSeek 官方价格，由每日脚本自动同步**

## 安装

### 一条命令（推荐，无需 pnpm）

```powershell
npx dsh-token-cost setup
```

这条命令会自动：把插件安装到你的 `web` profile（缺 pnpm 时通过 corepack 自动启用）、写入 `cordis.patch.yml` 配置、创建价格目录。重复执行安全（幂等）。

安装到其他 profile（例如 `tui`）：

```powershell
npx dsh-token-cost setup --profile tui
```

### 通过 dsh（需要 pnpm）

```powershell
# 在 dsh profile 目录（例如 ~/.dsh/profiles/web）
cd ~/.dsh/profiles/web
dsh plugin --profile web add dsh-token-cost
```

然后在 profile 的 `cordis.patch.yml` 中添加：

```yaml
- insert:
    - id: token-cost
      name: 'dsh-token-cost'
      config:
        currency: CNY
```

重启 `dsh web` 并强制刷新浏览器（Ctrl+Shift+R）。

## 价格更新

只有**两个**价格来源，都是 `~/.dsh/prices/`（或 `$DSH_HOME/prices/`）下的纯 JSON 文件：

| 文件 | 谁维护 | 优先级 |
|---|---|---|
| `official-prices.json` | **每日脚本自动维护** — 请勿手改 | 低 |
| `local-prices.json` | **你自己** — 可选覆盖 | 高 |

每个模型的生效价格：`local-prices.json` > `official-prices.json` > 内置默认值。修改后重启 `dsh web` 生效（投影会用新价格重放日志）。

### 每日自动同步（推荐）

`dsh-token-cost-update` 脚本会抓取 DeepSeek 官方定价页、解析当前价格并重写 `official-prices.json`：

```powershell
# 手动执行一次
npx dsh-token-cost-update

# 或直接调用安装的命令
dsh-token-cost-update
```

通过 Windows 任务计划程序每天执行一次：

```powershell
$action = New-ScheduledTaskAction -Execute (Get-Command node).Source -Argument "`"$(npm root -g)/dsh-token-cost/update-prices.mjs`""
$trigger = New-ScheduledTaskTrigger -Daily -At '09:30'
Register-ScheduledTask -TaskName 'DSH-TokenCost-UpdatePrices' -Action $action -Trigger $trigger -Force
```

脚本可以随时安全运行：抓取或解析失败时**不会改动现有文件**（以非零码退出），因此临时网络问题绝不会破坏上一次的好价格表。它会打印 `prices changed: true/false`，方便你从日志中发现官方调价。

### 手动本地覆盖

创建 `~/.dsh/prices/local-prices.json`：

```json
{
  "prices": {
    "deepseek-v4-flash": { "inputPerM": 1.5, "outputPerM": 3, "cacheReadPerM": 0.03 }
  }
}
```

格式为 `{ "prices": { "<模型id>": { "inputPerM", "outputPerM", "cacheReadPerM?", "cacheWritePerM?" } } }`。未配置的模型按 0 计价，但仍会累计 token 数量。

## 工作原理

- 一个 host 侧投影单元（`tokenCost`）折叠持久化会话日志：`request/header` 事件跟踪路由（`provider/model`），`assistant/message` 的用量按模型计价，并按消息 id 记录每条消息的费用。
- 投影走标准的 session-projection 通道（注册表快照、变更推送、`session.list` 基线），因此浏览器端渲染全部数据无需任何额外 RPC。
- 内置默认价格让插件在零配置下即可使用；已包含 DeepSeek 当前官方价格（2026-08）。

## 许可证

MIT
