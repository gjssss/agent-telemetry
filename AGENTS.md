# Repository Guidelines

## 项目结构与模块组织
- `packages/cli`: CLI 入口 `src/cli.ts`，构建产物在 `dist/`，并通过 `scripts/build-web.mjs` 打包前后端资源。
- `packages/frontend`: Vite + TanStack Router 前端，源码 `src/`，资源 `public/`，路由位于 `src/routes/`（保持现有文件夹命名规则如 `(auth)`、`_authenticated`）。
- `packages/backend`: Hono API，入口 `src/index.ts`。
- `packages/core`: 共享类型与工具，入口 `src/index.ts`。
- 根目录包含 `pnpm-workspace.yaml` 与通用 TS 配置。

## 构建、测试与开发命令
- 安装依赖：`pnpm install`。
- 构建 CLI 并打包 Web：`pnpm build`。
- 运行 CLI：`pnpm start:cli -- hello` / `pnpm start:cli -- web`。
- 前端开发：`pnpm --filter ./packages/frontend dev`（本地 Vite）。
- 后端开发：`pnpm --filter ./packages/backend dev`（`tsx watch`）。
- 类型检查：`pnpm -r typecheck`。

## 编码风格与命名规范
- 统一 TypeScript + ESM；Node 版本要求 `>=18`。
- 前端遵循 Prettier（2 空格、无分号、单引号、import 排序）与 ESLint（禁止 `console`，强制 type-only imports）。
- 前端别名 `@/` 指向 `packages/frontend/src`；React 组件用 PascalCase，hooks 用 `useX`。

## 提交与 PR 规范
- Git 历史显示采用 Conventional Commits（如 `feat:`）。请延续 `feat/fix/chore` 等前缀。

