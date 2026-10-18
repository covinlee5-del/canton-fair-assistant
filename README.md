# 广交会推广助手（Canton Fair Outreach Assistant）

面向「英语专业学生找外商 / 翻译 / 展会陪同机会」场景的 Chrome 扩展（Manifest V3）。

在**你自己正常浏览小红书**时，把你有兴趣的笔记记录下来、评估相关性、关联宣传文案，并**由你自己手动发送评论**、由插件记录后续进展。所有数据保存在本地浏览器中，不上传任何服务器。

> **产品红线（本仓库所有代码均遵守）**
> 不自动发布评论、不自动点赞/关注/私信；不绕过登录或验证码；不调用未经验证的平台内部接口；不上传账号凭证；无默认第三方上传。

> **远程仓库（公开）**：<https://github.com/covinlee5-del/canton-fair-assistant>
> 公开仓库，ChatGPT / Grok 等外部工具可直接读取代码与文档；协作约定见 §12。

---

## 1. 当前状态

| 阶段 | 内容 | 状态 |
|---|---|---|
| 阶段 1 | 需求复核、风险分析、架构、数据模型、页面读取验证方案 | ✅ 完成（架构与 UI/权限策略已确认） |
| 阶段 2 | 最小可运行插件：构建链路、MV3 + 侧边栏/管理页、存储层、任务管理、只读诊断探针 | 🟡 **代码完成，待你本机安装验证** |
| 阶段 3 | 正式笔记提取（标题/链接/摘要/时间）、去重、模拟页面测试套件 | ⬜ 未开始（依赖阶段 2 探针的真实页面实测结果） |
| 阶段 4 | 相关性评分、文案库、笔记列表与筛选、手动推广记录工作流 | ⬜ 未开始 |
| 阶段 5 | 回复与联系人跟进、统计面板、导出/导入、设置页 | ⬜ 未开始 |
| 阶段 6 | 平台改版回归、稳定性加固、文档收尾 | ⬜ 未开始 |

### 阶段 2 的验证边界（请务必读这一段）

| 项目 | 状态 | 说明 |
|---|---|---|
| 类型检查 `tsc --noEmit` | ✅ 已执行，0 错误 | 代理环境实测 |
| 核心逻辑执行验证 | ✅ 87 项检查全部通过 | 代理环境实测（详见 `docs/verification-results.md` §3） |
| `npm run build` | ⏳ 待你本机执行 | 代理沙箱禁止创建子进程，esbuild 无法启动（`spawn EPERM`），与项目代码无关 |
| `npm test`（vitest） | ⏳ 待你本机执行 | 同上原因 |
| Chrome 加载扩展 / 侧边栏 / 管理页 | ⏳ 待你验证 | 需要真实浏览器 |
| 真实小红书页面探针 | ⏳ 待你验证 | 未实测前，**不得**声称"能读取小红书笔记" |

**小红书页面结构的真实信号尚未采集**，因此本阶段的内容脚本只做只读诊断（统计结构信号），`extractVisibleNotes()` 返回空数组 —— 这是刻意的诚实降级，不是 bug。正式提取器在阶段 3 依据你的实测记录编写。

---

## 2. 快速开始

### 环境要求

- Node.js ≥ 18（开发时使用 v24.19.0）
- npm ≥ 9
- Chrome ≥ 114（Side Panel API 要求）

### 安装、检查、构建

```bash
npm install
npm run typecheck      # TypeScript 类型检查（应输出 0 错误）
npm test               # 单元 + 集成测试（vitest）
npm run build          # 产出 dist/（可加载到 Chrome）
```

`npm run dev` 会以 watch 模式同时构建主包与内容脚本，改完代码后到 `chrome://extensions` 点刷新即可。

### 加载到 Chrome

1. 打开 `chrome://extensions`
2. 右上角打开「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本项目的 **`dist`** 目录
5. 建议把图标固定到工具栏；点击图标即打开侧边栏
6. 管理页：`chrome://extensions` → 本扩展「详情」→「扩展程序选项」

> 若加载时报 manifest 错误，请先确认 `dist/` 中同时存在 `manifest.json`、`background.js`、`sidepanel.html`、`options.html`、`content.js`、`icons/`。

---

## 3. 本阶段能做什么

**可以：**

- 在管理页创建/编辑/复制/暂停/删除**推广任务**（名称、关键词、语言、类别、目标时间范围、备注），数据存在本地 IndexedDB
- 在侧边栏查看当前任务、切换当前任务
- 在小红书页面点「读取当前页面诊断」，得到一份**只读**的结构诊断：页面类型、候选笔记链接数、笔记卡片数、加载状态、错误码；可一键复制诊断 JSON
- 所有失败路径都有明确错误码与中文引导文案（不支持页面 / 权限不足 / 页面未加载 / 未识别到笔记 …）

**还不能（阶段 3 起）：**

- 提取笔记的标题、摘要、发布时间
- 去重、相关性评分、笔记列表
- 文案库、手动推广记录、回复跟进、统计、导出导入

---

## 4. 使用流程（当前可用范围）

1. 管理页 → 任务 → 新建任务（例如「广交会翻译机会」，关键词：广交会 / Canton Fair / interpreter）
2. 侧边栏 → 选择当前任务
3. 在浏览器中正常打开小红书的搜索结果页（**先在页面上点一下扩展图标**，让 `activeTab` 授权到该标签页）
4. 侧边栏 → 点「读取当前页面诊断」
5. 查看诊断结果；把 JSON 复制到 `docs/verification-results.md` 的记录表里
6. 按 `docs/04-页面读取验证方案.md` §3 的 11 步协议继续测（换关键词、滚动加载、笔记详情页、未授权场景、退出登录、验证码场景）

---

## 5. 权限说明（最小必要）

| 权限 | 用途 | 说明 |
|---|---|---|
| `storage` | 保存轻量设置与最近一次诊断 | 仅 `storage.local`；**不使用 `storage.sync`**，避免数据同步到谷歌服务器 |
| `activeTab` | 用户点击扩展图标后，临时获得当前标签页的访问权 | 关闭标签页或跨源跳转即失效；这是替代"整站权限"的起步方案 |
| `scripting` | 按需注入只读诊断脚本 | 只在用户点击「读取」时注入一次，不常驻页面 |
| `sidePanel` | 提供侧边栏界面 | 需 Chrome 114+ |

**明确未申请**：`host_permissions`（首版不声明）、`tabs`、`downloads`、`cookies`、`webRequest`、`history`、`unlimitedStorage`、`<all_urls>`。

> 若阶段 2 实测发现 `activeTab` 在侧边栏流程中不可靠（例如侧边栏保持打开时切换标签页导致授权失效），再评估仅限 `*://*.xiaohongshu.com/*` 的站点权限，并在文档中向用户说明原因。

---

## 6. 隐私与数据

- 全部数据保存在**本机浏览器**：任务/笔记/文案/活动记录在 IndexedDB（库名 `canton-fair-assistant`），设置在 `chrome.storage.local`。
- 页面上只读取**当前可见的 DOM 结构信号**；诊断里的页面地址只保留 `host + pathname`，**丢弃所有查询参数**（小红书链接里的 `xsec_token` 等一律不落库）。
- 不读取、不保存 Cookie / 登录凭证 / 账号密码；不含任何网络请求代码（无 `fetch` 到第三方、无埋点）。
- 不写入页面：不自动评论、不自动点赞/关注/私信，不发送任何表单。

---

## 7. 已知限制

1. 只有 Chrome ≥ 114 支持侧边栏；其他 Chromium 浏览器未验证。
2. 本阶段的读取结果是**结构诊断**，不含笔记正文；正式提取待阶段 3。
3. 侧边栏在标签页切换时的 `activeTab` 行为需实测（记录在 `docs/verification-results.md`）。
4. 小红书为 SPA，笔记卡片选择器依赖页面结构；改版会触发 `DOM_STRUCTURE_CHANGED`，需按验证记录更新适配器。
5. 发布时间的原始文本（如「3 天前」）在阶段 3 之前不做解析。
6. 占位图标为脚本生成的「CF」方形图，正式品牌图标后补。

---

## 8. 目录结构

```text
canton-fair-assistant/
├── sidepanel.html / options.html      # 两个 UI 入口（根目录，产物平铺进 dist）
├── public/manifest.json               # 手写 MV3 manifest
├── public/icons/                      # 16/48/128 占位图标
├── src/
│   ├── shared/                        # 纯 TS：类型、常量、领域函数、工具（零 chrome、零 React）
│   ├── platform/                      # chrome.* 薄封装（唯一调用点）
│   ├── data/                          # IndexedDB（idb）+ Repository + migrations + 设置仓库
│   ├── services/                      # 业务服务（task-service …）
│   ├── messaging/                     # 消息名与请求/响应契约
│   ├── background/                    # Service Worker：路由、命令、生命周期
│   ├── content/                       # 按需注入的只读探针（单文件 IIFE）
│   └── ui/                            # api 封装 + 共享组件 + sidepanel + options
├── tests/                             # unit + integration（vitest）
├── scripts/                           # make-icons.ps1、watch.mjs
├── docs/                              # 阶段文档（见下）
├── vite.config.ts                     # 主构建
├── vite.content.config.ts             # 内容脚本构建
└── tsconfig.json / vitest.config.ts
```

## 9. 开发命令

| 命令 | 作用 |
|---|---|
| `npm run typecheck` | 类型检查（strict + noUncheckedIndexedAccess） |
| `npm test` | vitest 单测 + 集成测试 |
| `npm run build` | 主构建 + 内容脚本构建 → `dist/` |
| `npm run build:content` | 仅重建 `dist/content.js` |
| `npm run dev` | 双配置 watch 模式 |

## 10. 文档索引

| 文档 | 内容 |
|---|---|
| `docs/01-需求复核与风险分析.md` | 需求澄清点、Top-5 风险与验证手段 |
| `docs/02-技术架构.md` | 分层架构、目录、依赖、权限、消息协议、ADR-001 构建方案 |
| `docs/03-数据模型.md` | 全部 TS 类型、状态机、去重规则、导出格式、迁移策略 |
| `docs/04-页面读取验证方案.md` | 探针设计、11 步真实页面测试协议、错误码→文案映射 |
| `docs/05-阶段1任务与验收清单.md` | 阶段 1 任务与已确认决策 |
| `docs/06-阶段2任务清单与操作步骤.md` | 阶段 2 任务、操作步骤、验收清单（勾选状态） |
| `docs/verification-results.md` | **验证记录**：已执行结果 + 待你填写的真实页面记录表 |

## 11. 变更记录

- **0.1.0（阶段 2）**：MV3 骨架（侧边栏 + 管理页）、IndexedDB 仓储层、任务 CRUD、只读诊断探针、错误码体系、87 项逻辑验证（含消息层端到端）、验证记录模板。

## 12. 远程仓库与协作约定

仓库：<https://github.com/covinlee5-del/canton-fair-assistant>（public，默认分支 `main`）

为了让 ChatGPT、Grok 等外部工具与本地开发互不踩坑，约定如下：

1. **单一事实来源是 `main` 分支**。任何工具改动前先读 `README.md` → `docs/02-技术架构.md` → `docs/03-数据模型.md`，不要凭猜测改类型或消息契约。
2. **每次改动一个主题**，提交信息用 `feat:` / `fix:` / `docs:` / `test:` / `chore:` 前缀（示例：`feat: 笔记提取器支持卡片标题`）。
3. **不提交产物与依赖**：`node_modules/`、`dist/`、`.npm-cache/`、`.local-verify/out|probe-out/` 已在 `.gitignore` 中排除。
4. **不把密钥、账号凭证、真实用户数据写入仓库**；插件数据只存在浏览器本地。
5. **守住产品红线**（见文首）：外部工具新增功能时，不得引入自动评论/自动点赞/私信或绕过风控的实现。
6. 若某工具只能网页操作：可直接在 GitHub 网页上编辑文件并以 Pull Request 提交，本地再 `git pull` 合并，避免与本地未提交改动冲突。

本地克隆与校验：

```bash
git clone https://github.com/covinlee5-del/canton-fair-assistant.git
cd canton-fair-assistant
npm install && npm run typecheck && npm test && npm run build
```

