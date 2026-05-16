# Agent Telemetry Technical Design

## 技术栈

- Runtime / package manager: Bun。
- Backend: Hono on Bun。
- Database: SQLite for V1，使用 Bun 内置 `bun:sqlite`。
- ORM: Drizzle ORM，SQLite 使用 `drizzle-orm/bun-sqlite`。
- Auth: Better Auth + Drizzle adapter + Bearer plugin。
- Frontend: Vite + React + TanStack Router，复用现有模板 layout 和登录页。

`cli.js server` 启动后端服务，并由后端托管前端静态资源。

核心本地目录为 `~/.agent-telemetry`。

## 数据库设计

V1 使用 SQLite，本地数据库固定为 `~/.agent-telemetry/data.db`。首次运行 `server` 时创建并初始化。服务启动时启用：

- `PRAGMA foreign_keys = ON`
- `PRAGMA journal_mode = WAL`
- `PRAGMA busy_timeout = 5000`

后续需要兼容 PostgreSQL，因此从 V1 开始避免 SQLite-only 设计：

- 主键使用 text UUID/ULID，不使用 SQLite autoincrement。
- token、次数等计数使用 integer。
- 费用使用 integer 最小单位，例如 micro USD，不使用 float。
- 时间统一使用 UTC ISO string。
- 业务表不使用 `sessions` 命名，避免和 Better Auth session 表冲突。

## 数据表

Better Auth 负责用户和鉴权相关表，昵称使用用户 `name` 字段。业务表至少包括：

### session_metrics

- 用户归属：`user_id`。
- 唯一身份：`provider`、`session_id`。
- 时间：`started_at`、`ended_at`、`uploaded_at`。
- 维度：`model`、`model_provider`、`reasoning_effort`、`cli_version`、`model_context_window`。
- Token：`input_tokens`、`output_tokens`、`cached_input_tokens`、`reasoning_output_tokens`、`total_tokens`。
- 行为计数：`api_call_count`、`conversation_turn_count`、`user_message_count`、`tool_call_count`。
- 费用：`input_cost`、`output_cost`、`cached_input_cost`、`reasoning_output_cost`、`total_cost`。

唯一约束：

```sql
UNIQUE(user_id, provider, session_id)
```

### upload_batches

记录每次上传批次的用户、provider、开始/完成时间、接收数量、新增数量、更新数量、跳过数量和错误数量。

## 数据处理逻辑

Codex session 解析只读取必要结构化字段，并构造白名单聚合数据：

- `session_id` 优先使用第一条 `session_meta.id`，文件名 UUID 作为校验或回退。
- `api_call_count` 按唯一 `total_token_usage` 累计快照数量计算。
- token 总量取最后一个有效累计快照。
- `conversation_turn_count` 按唯一 `turn_context.turn_id` 数量计算。
- `user_message_count` 按 `event_msg.type == "user_message"` 数量计算。
- `tool_call_count` 只统计工具调用数量，不上传参数和输出。

上传请求不信任客户端传入用户身份。服务端从 Bearer token 解析 `user_id`，并以 `user_id + provider + session_id` 幂等 upsert。

费用由后端根据 `~/.agent-telemetry/models.json` 计算。模型价格缺失时不阻断上传和统计，记录缺失模型 id，并让前端提示管理员补充价格。

## 增量上传历史

`~/.agent-telemetry/history.json` 记录每个已成功上传的 Codex session 文件状态：

```ts
type UploadHistoryItem = {
  provider: 'codex'
  session_id: string
  source_path: string
  file_size: number
  file_mtime_ms: number
  last_uploaded_at: string
}
```

`cli.js upload` 的处理规则：

- 新出现的 session 完整解析并上传。
- 已记录但 `file_size` 或 `file_mtime_ms` 变化的 session 重新完整解析并上传最新聚合结果。
- 已记录且文件未变化的 session 跳过。
- 本地删除的历史 session 不影响服务端已有数据。

history 仅在服务端确认上传成功后更新。

## 鉴权设计

- 前端使用 Better Auth cookie session。
- CLI 使用 Better Auth Bearer token。
- `cli.js user create <email> <password>` 用于初始化或管理用户，昵称默认等于邮箱。
- 前端 Register 允许自助注册，注册时昵称默认等于邮箱。

`~/.agent-telemetry/auth.json` 存储 CLI 登录获得的 `access_token` 和 `refresh_token`。

## 配置与价格文件

- `config.json`: 首次 CLI 运行时创建，默认 `base_url` 为 `http://localhost:3000`。代码中使用 `configManager` 统一管理配置文件和字段；读取不到所需字段时直接报错。
- `models.json`: 首次运行 `server` 时创建并写入默认模型价格表。价格单位为 USD / 1M tokens，运行时换算为整数最小费用单位。

默认模型价格表至少包含以下 USD / 1M tokens 价格：

| model | input | cached input | output |
| --- | ---: | ---: | ---: |
| `gpt-5.5` | 5.00 | 0.50 | 30.00 |
| `gpt-5.4` | 2.50 | 0.25 | 15.00 |
| `gpt-5.4-mini` | 0.75 | 0.075 | 4.50 |
| `gpt-5.4-nano` | 0.20 | 0.02 | 1.25 |
| `gpt-5.3-codex` | 1.75 | 0.175 | 14.00 |
| `claude-opus-4-7` | 5.00 | 0.50 | 25.00 |
| `claude-opus-4-6` | 5.00 | 0.50 | 25.00 |
| `claude-sonnet-4-6` | 3.00 | 0.30 | 15.00 |
| `claude-sonnet-4-5` | 3.00 | 0.30 | 15.00 |
| `claude-haiku-4-5` | 1.00 | 0.10 | 5.00 |

当前默认价格来源为 OpenAI API Pricing 与 Anthropic Claude Pricing 官方页面；OpenAI 使用 Standard / short context 价格，Claude cached input 使用 cache hits / refreshes 价格。

## 前端设计

前端固定页面：

- `/login`: 登录/注册。
- `/`: 信息页。
- `/leaderboard`: 排行榜。
- `/profile`: 个人页。

信息页和排行榜都使用 `1d / 7d / 30d / total` 时间范围过滤。排行榜增加费用/Token 子 Tab。

## 隐私约束

不上传 prompt、response、reasoning、命令输出、项目路径、文件路径、git 信息或原始 JSONL。

## 验收方式

后端实现使用 `curl` 验收。包含前端改动时，使用 agent-browser 验收并将截图保存到 `/tmp`。
