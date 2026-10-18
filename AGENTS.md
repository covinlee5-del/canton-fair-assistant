# AGENTS.md — 给 AI 协作者的说明

本文件面向所有 AI 编码工具（ChatGPT、Grok、Claude、Codex、DeepSeek 等）。
**任何 AI 在改动本仓库前，先读完本文件与 `README.md`。**

---

## 1. 项目是什么

Chrome 扩展（Manifest V3），名为「广交会推广助手 / Canton Fair Outreach Assistant」。
场景：英语专业学生在**自己正常浏览小红书**时，记录感兴趣的笔记、评估相关性、关联宣传文案，
**由本人手动发送评论**，插件只负责记录与跟进。数据全部存在浏览器本地（IndexedDB），不上传服务器。

技术栈：TypeScript + Vite + React 18 + idb（IndexedDB），测试用 vitest。

## 2. 硬性红线（不可协商，任何改动都不得违反）

1. 不自动发布评论、不自动点赞 / 关注 / 私信 —— 一律由用户手动点击。
2. 不绕过登录、验证码、风控；不伪造请求签名。
3. 不调用未经验证的平台内部接口；不逆向私有 API。
4. 不上传账号凭证、Cookie、真实用户数据到任何服务器。
5. 不做默认开启的第三方数据上传；导出功能只能由用户主动触发。

若某需求必须打破以上任一条，**停下来**，在 PR 描述里说明冲突并等待人工决策。

## 3. 分层架构（改动必须落在正确层）

```text
src/shared/     纯 TS：类型、常量、领域函数、工具。零 chrome.*、零 React
src/platform/   chrome.* 的薄封装，是全仓库唯一允许直接调用 chrome API 的地方
src/data/       IndexedDB（idb）仓储层、迁移
src/services/   业务服务（如 task-service）
src/messaging/  消息名与请求/响应的类型契约
src/background/ Service Worker：路由、命令、生命周期
src/content/    按需注入的只读探针（单文件 IIFE）
src/ui/         React（sidepanel + options）+ api 封装 + 共享组件
```

规则：`shared` 不得反向依赖任何层；业务逻辑写在 `services` 而非 UI 组件里；
新增 `chrome.*` 调用必须先加到 `platform`。

## 4. 提交前必须自检

```bash
npm install           # 首次
npm run typecheck     # 必须 0 错误
npm test              # 必须全绿
npm run build         # 必须产出 dist/
```

三项全过才算完成。只改了文档可以例外。

## 5. 提交与协作约定

- 默认分支 `main`，**不要直接改 main**，改到分支后开 Pull Request。
- 一个 PR 只做一件事；提交信息用 `feat:` / `fix:` / `docs:` / `test:` / `chore:` 前缀。
- 不要提交：`node_modules/`、`dist/`、`.npm-cache/`、`.local-verify/out|probe-out/`（已在 `.gitignore`）。
- 不要提交任何密钥、token、`.env`、真实笔记/客户数据。
- 不要在 PR 里顺手格式化无关文件，会让 review 无法进行。

## 6. 当前进度（改动前先对齐）

- 阶段 1、2 已完成：构建链路、MV3 侧边栏/管理页、IndexedDB 仓储、任务 CRUD、只读诊断探针。
- 阶段 3 未开始：正式笔记提取（标题/链接/摘要/时间）、去重、真实页面测试。
- **小红书页面结构信号尚未采集**，因此 `extractVisibleNotes()` 目前刻意返回空数组。
  写提取器前必须先看 `docs/verification-results.md` 里的实测记录，不要凭空猜选择器。

## 7. 文档索引

| 文件 | 内容 |
|---|---|
| `docs/01-需求复核与风险分析.md` | 需求澄清、风险 |
| `docs/02-技术架构.md` | 分层、权限、消息协议、构建 ADR |
| `docs/03-数据模型.md` | 全部类型、状态机、去重、导出格式 |
| `docs/04-页面读取验证方案.md` | 探针设计与 11 步实测协议 |
| `docs/05/06-阶段任务清单` | 各阶段任务与验收 |
| `docs/verification-results.md` | 已执行结果 + 真实页面记录表（人填） |
| `docs/07-AI协作操作指南.md` | 非技术用户的操作步骤（人读） |
| `docs/08-阶段2验收操作手册.md` | 阶段 2 验收：跑命令 → 装 Chrome → 自测 11 项 → 探针 11 步（人读） |
| `docs/09-阶段3任务清单.md` | 阶段 3 任务分解 T3.0–T3.10、验收标准、风险与节奏 |
