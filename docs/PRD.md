# Agent Metry PRD

## 产品定位

Agent Metry 是一个自部署的 agent 消耗记录 App。用户通过 CLI 主动上传本机 Codex session 的非内容型聚合数据，在 Web 控制台查看个人使用概览、用户排行榜和个人资料。

第一版只支持 Codex，后续可扩展其他 provider。

## 核心链路

- `cli.js server`: 启动前后端一体服务。
- `cli.js config set/get/list/remove`: 管理 CLI 配置。
- `cli.js models list/missing/set/remove/reprice`: 管理模型价格并修正历史费用。
- `cli.js user create <email> <password>`: 创建用户，昵称默认等于邮箱。
- `cli.js login <email> <password>`: 登录并保存本地 token。
- `cli.js upload`: 使用本地 token 上传 Codex session 聚合数据。

上传时不由 CLI 传入 `user_id`。后端从登录 token 解析当前用户，并将数据归属到该用户。

上传采用增量机制。CLI 会记录已成功上传的 Codex session 文件状态；后续只上传新出现或文件大小/修改时间发生变化的 session。已记录且未变化的 session 会跳过。本地删除历史 session 不影响服务端已有数据。

## 上传数据范围

上传粒度是 session 级聚合记录，包含：

- provider、session id、时间、模型、模型供应商、reasoning effort、CLI 版本、上下文窗口。
- input/output/cached/reasoning/total token。
- API 调用次数、对话轮数、用户消息数、工具调用数。

系统不上传：

- prompt、response、reasoning 内容。
- 命令和命令输出。
- 项目路径、文件路径、git 信息。
- 原始 JSONL。

## Web 页面

第一版固定 4 个用户可见页面：

- 登录页：邮箱密码登录；Register 默认开放，重复邮箱返回错误，注册成功自动登录，昵称默认等于邮箱。
- 信息页：主页面，使用 `1d / 7d / 30d / total` 过滤区间，展示费用、Token、Agent、模型和行为计数。
- 排行榜：使用 `1d / 7d / 30d / total` 过滤区间，并支持费用 / Token 子 Tab；表格展示用户排行。
- 个人页：展示个人信息，支持编辑昵称，昵称使用用户 `name` 字段。

信息页、排行榜和个人页作为主导航项。空数据状态保持空白表格或空白数据区，不额外引导复杂流程。

## 费用与价格

费用由后端计算。模型价格来自 `~/.agent-metry/models.json`，首次启动或执行 `models` 命令时写入默认价格表。

如果某个模型没有价格配置，上传和统计不能失败；后端应记录价格缺失状态，前端提示管理员用 `models set` 补充该模型 id 的价格，并重算已上传 session 的历史费用。

## 成功标准

- CLI 能完成 server、config、models、user create、login、upload 主链路。
- 重复 upload 不产生重复 session，且未变化的本地 session 会被跳过。
- Web 能完成登录/注册、查看信息页、查看排行榜、编辑昵称。
- 隐私敏感内容不会被上传。
