# Agent Metry

Agent Metry 是一个自部署的 agent 消耗记录应用。用户通过 CLI 主动上传本机 Codex session 的非内容型聚合数据，并在 Web 控制台查看个人使用概览、用户排行榜和个人资料。

V1 只支持 Codex。上传粒度是 session 级聚合记录，包含模型、时间、token、API 调用次数、对话轮数、用户消息数、工具调用数和后端计算出的费用。系统不上传 prompt、response、reasoning、命令输出、项目路径、文件路径、git 信息或原始 JSONL。

## 产品组成

- `agent-metry` CLI：启动自部署服务、管理本地配置、创建用户、登录并上传 Codex session 聚合数据。
- Hono 后端：提供鉴权、用户、上传、统计、排行榜和个人资料接口。
- React Web 控制台：提供登录页、信息页、排行榜和个人页。
- SQLite 本地数据库：V1 使用 `~/.agent-metry/data.db` 保存用户和聚合指标。

核心本地目录是 `~/.agent-metry`：

- `config.json`：CLI 配置，默认 `base_url` 为 `http://localhost:3000`。
- `auth.json`：CLI 登录后保存的访问凭据。
- `data.db`：服务端 SQLite 数据库，首次运行 `server` 时创建。
- `history.json`：已成功上传的 Codex session 文件状态，用于增量上传。
- `models.json`：模型价格表，首次运行 `server` 时写入默认值。

## 用法与核心链路

### 1. 安装依赖并构建

```bash
bun install
bun run build
```

`bun run build` 会构建前端、后端和 CLI，并把 Web 资源打包进 CLI 输出目录。

### 2. 启动自部署服务

源码仓库内运行：

```bash
bun run --filter @agent-metry/cli start -- server --port 3000
```

构建后或安装发布包后，正式 CLI 命令为：

```bash
agent-metry server --port 3000
```

服务启动后访问 `http://localhost:3000` 打开 Web 控制台。后端健康检查接口为：

```bash
curl http://localhost:3000/api/health
```

### 3. 配置 CLI 服务地址

默认服务地址是 `http://localhost:3000`。如果服务运行在其他地址，先更新 `base_url`：

```bash
agent-metry config set base_url http://localhost:3000
agent-metry config get base_url
agent-metry config list
agent-metry config remove base_url
```

源码仓库内调试时，把 `agent-metry` 替换为：

```bash
bun run --filter @agent-metry/cli start --
```

例如：

```bash
bun run --filter @agent-metry/cli start -- config list
```

### 4. 创建用户并登录 CLI

CLI 创建用户：

```bash
agent-metry user create user@example.com your-password
```

登录并保存后续上传使用的 token：

```bash
agent-metry login user@example.com your-password
```

Web 控制台也支持邮箱密码登录和注册。注册成功后会自动登录，默认昵称等于邮箱。

### 5. 上传 Codex session 聚合数据

```bash
agent-metry upload
```

上传默认扫描：

- `~/.codex/sessions/**/*.jsonl`
- `~/.codex/archived_sessions/*.jsonl`

CLI 会根据 `history.json` 做增量上传：新 session 会上传；文件大小或修改时间变化的 session 会重新解析并上传；未变化的 session 会跳过。本地删除历史 session 不会删除服务端已有数据。

### 6. 查看 Web 控制台

- `/login`：登录和注册。
- `/`：信息页，支持 `1d / 7d / 30d / total` 时间范围。
- `/leaderboard`：排行榜，支持费用和 Token 两类排行。
- `/profile`：个人页，支持查看个人信息和编辑昵称。

如果上传数据中的模型没有价格配置，上传和统计不会失败；前端会提示管理员补充 `~/.agent-metry/models.json` 中对应模型 id 的价格。

## 贡献与仓库开发引导

本仓库使用 Bun workspace，统一 TypeScript + ESM。

```text
packages/cli       CLI 入口、命令实现和 Web 打包脚本
packages/backend   Hono API、鉴权、SQLite 初始化和统计逻辑
packages/frontend  Vite + React + TanStack Router Web 控制台
packages/core      共享类型、本地状态管理、Codex session 解析和上传规划
docs/PRD.md        产品需求文档
docs/TECH.md       技术设计文档
```

开发常用命令：

```bash
bun install
bun run build
bun run typecheck
bun run --filter @agent-metry/backend dev
bun run --filter @agent-metry/frontend dev
bun run --filter @agent-metry/cli start -- server --port 3000
```

涉及产品边界再读 `docs/PRD.md`；涉及 Codex 数据解析、数据库、费用计算、鉴权或隐私约束再读 `docs/TECH.md`。

开发约定：

- 只实现当前任务需要的最小改动，避免保留无用兼容层或新增未要求的抽象。
- 后端接口改动使用 `curl` 验收，至少覆盖健康检查、用户创建/登录、上传、统计、排行榜和昵称更新中受影响的链路。
- 前端页面改动使用 agent-browser 做视觉验收，截图保存到系统 `/tmp` 目录。
- 前端遵循现有 ESLint / Prettier 配置；组件使用 PascalCase，hooks 使用 `useX`，`@/` 指向 `packages/frontend/src`。
- 提交信息延续 Conventional Commits，例如 `feat:`、`fix:`、`chore:`。

发布相关命令：

```bash
npm publish
bun run release
bun run release:patch
```

发布流程使用 `bumpp` 保持包版本和 CLI `--version` 同步。
