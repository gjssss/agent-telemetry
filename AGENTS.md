# Repository Guidelines

## 语言与验收要求
- 使用中文回答。
- 编写包含前端项目时，使用 agent-browser skill 进行视觉验收，截图文件存放在系统 `/tmp` 文件夹内。
- 编写后端项目时，使用 `curl` 进行接口验收。

## 产品文档与渐进式披露
- [docs/PRD.md](docs/PRD.md): 产品需求文档。用于理解产品定位、目标用户、核心链路、前端产品形态、数据范围和非目标范围。做需求澄清、页面范围判断或产品取舍时先读此文件。
- [docs/TECH.md](docs/TECH.md): 技术设计文档。用于理解 CLI、Codex session 解析、数据处理逻辑、数据表、费用计算和隐私约束。做数据库、解析器、费用计算或鉴权实现时读此文件。
- [docs/V1.md](docs/V1.md): 当前版本实现范围。用于确认本期必须实现什么以及如何验收。开始编码前优先读此文件，再按需要进入 PRD 或 TECH。
- 渐进式披露原则：一般任务先读 `docs/V1.md`；涉及产品边界再读 `docs/PRD.md`；涉及 Codex 数据处理逻辑、解析规则、数据库、费用计算或隐私实现再读 `docs/TECH.md`。不要一次性重写所有文档，除非用户明确要求。

## 当前任务目标
- 当前任务是实现 [docs/V1.md](docs/V1.md) 中说明的 V1 功能范围。

## 项目结构与模块组织
- `packages/cli`: CLI 入口 `src/cli.ts`，构建产物在 `dist/`，并通过 `scripts/build-web.mjs` 打包前后端资源。
- `packages/frontend`: Vite + TanStack Router 前端，源码 `src/`，资源 `public/`，路由位于 `src/routes/`（保持现有文件夹命名规则如 `(auth)`、`_authenticated`）。
- `packages/backend`: Hono API，入口 `src/index.ts`。
- `packages/core`: 共享类型与工具，入口 `src/index.ts`。
- 根目录包含 `pnpm-workspace.yaml` 与通用 TS 配置。

## 构建、测试与开发命令
- 安装依赖：`pnpm install`。
- 构建 CLI 并打包 Web：`pnpm build`。
- 运行 CLI：本产品正式命令为 `server`、`config`、`user create`、`login`、`upload`；模板中的 `hello` / `web` 不作为目标功能保留。
- 前端开发：`pnpm --filter ./packages/frontend dev`（本地 Vite）。
- 后端开发：`pnpm --filter ./packages/backend dev`（`tsx watch`）。
- 类型检查：`pnpm -r typecheck`。

## 编码风格与命名规范
- 统一 TypeScript + ESM；Node 版本要求 `>=18`。
- 前端遵循 Prettier（2 空格、无分号、单引号、import 排序）与 ESLint（禁止 `console`，强制 type-only imports）。
- 前端别名 `@/` 指向 `packages/frontend/src`；React 组件用 PascalCase，hooks 用 `useX`。

## 提交与 PR 规范
- Git 历史显示采用 Conventional Commits（如 `feat:`）。请延续 `feat/fix/chore` 等前缀。
