# 验证记录（Verification Results）

> 用途：区分「已执行的验证」与「待验证的能力」。**没有记录在案的，就不算验证通过。**
> 填写原则：只写实际观测到的结果；失败也照实记录；不要用"应该没问题"代替证据。

> **阶段 2 状态（2026-10-18 更新）：✅ 通过。** 四条标准全部满足 —— ① typecheck 无输出 / 8 文件 72 用例全绿 / `dist/` 完整；② Chrome 加载无红色错误；③ C 部分 11 项全 ✅；④ D 部分 1–7 符合预期、8 在站点权限下能读到、9 仅记录信号（判定排阶段 3）、10 注明未触发。
> 唯一曾阻断验收的缺陷（`activeTab` 拿不到授权）已修复并在交付版上复验通过，见 §6.1。

---

## 1. 环境信息

| 项目 | 值 |
|---|---|
| 记录日期 | 2026-10-18（代理环境执行部分）；2026-10-18 22:43（真实页面复验） |
| 扩展版本 | 0.1.0 |
| Chrome 版本 | 150.0.7871.125（要求 ≥ 114） |
| Node / npm | v24.19.0 / 11.17.0 |
| selectors 版本 | `probe-0.1.0`（见 `src/content/adapters/selectors.ts`） |
| 扩展 ID（本次加载） | `cllnibgondpgcogdifaeankaligfiodk` |
| 权限方案 | `host_permissions: ["*://*.xiaohongshu.com/*"]`（阶段 2 验收后由 `activeTab` 改判，见 `docs/02` §6） |

---

## 2. 代理环境（编写代码的环境）已执行的结果

| 检查项 | 命令 | 结果 | 备注 |
|---|---|---|---|
| 依赖安装 | `npm install` | ⚠️ 仅能部分验证 | 用户目录下的 npm 缓存被沙箱拒绝（EPERM），改用工作区内缓存 `--cache .npm-cache` 后下载成功；随后因沙箱禁止子进程，安装脚本无法执行，改用 `--ignore-scripts` 完成安装。**你在本机直接 `npm install` 即可，不需要这些参数。** |
| 类型检查 | `node node_modules/typescript/bin/tsc --noEmit` | ✅ 通过（0 错误） | 覆盖 `src/` + `tests/` + 三个配置文件，strict + `noUncheckedIndexedAccess` |
| 核心逻辑执行验证 | `node .local-verify/out/.local-verify/verify.js` | ✅ 87/87 项通过 | 见 §3；做法见 §4 |
| `npm run build`（交付配置） | `vite build` | ⛔ 无法直接执行 | 沙箱禁止子进程：`Error: spawn EPERM`（esbuild 启动失败），发生在加载配置阶段，**与项目代码无关** |
| 构建等价执行（影子配置） | `node .local-verify/shadow-build.mjs` | ✅ 两次构建均成功 | 产物见 §4.1；覆盖真实入口（两个 HTML + SW + 内容脚本） |
| `npm test`（交付配置） | `vitest run` | ⛔ 无法直接执行 | 同上：esbuild 无法启动 |
| 测试等价执行（影子配置） | `node .local-verify/shadow-test.mjs` | ✅ 8 文件 / 72 用例全部通过 | `Test Files 8 passed (8)`、`Tests 72 passed (72)`、退出码 0（见 §4.2） |
| Chrome 加载 / 侧边栏 / 管理页 | — | ✅ 已执行（2026-10-18） | 卡片「广交会推广助手 0.1.0」、无红色错误；侧边栏 360×668；管理页 6 个导航正常 |
| 真实小红书页面探针 | — | ✅ 已执行（2026-10-18，真实账号） | 11 步全部执行；数据见 §6。**交付版在修复权限前读取不可用，已修复并复验通过**（见 §6.1） |

---

## 3. 核心逻辑执行验证明细（87 项）

验证方式：用 `tsc` 把 `src/` 子集编译为 CommonJS，再由 Node 直接 `require` 真实模块执行断言（不使用模拟实现；IndexedDB 用 `fake-indexeddb`、`chrome.storage.local` 与 `chrome.runtime`/`tabs`/`scripting` 用最小替身、DOM 用 jsdom）。

| 分组 | 覆盖内容 | 结果 |
|---|---|---|
| 链接规范化（8 项） | `/explore/`、`/discovery/item/` 归一化；丢弃全部查询参数；非小红书域名与相似域名（`xiaohongshu.com.evil.example`）不误判；缺 ID / 非法 URL 返回 null；笔记 ID 提取；诊断 URL 只保留 host+pathname | ✅ |
| 工具函数（9 项） | 文本折叠空白与 null 安全、截断长度、大小写不敏感去重；`AppError` 错误码与用户文案；`toAppError` 透传/包装；时间格式化空值占位 | ✅ |
| 任务服务（12 项） | 空名称/空关键词被拒；关键词去重与规范化；创建默认 `ACTIVE` 且补齐默认相关性规则；更新保留 id；复制生成新 id 与「（副本）」；非法状态被拒；归档过滤；删除 | ✅ |
| 设置仓库（5 项） | 首次读取返回默认值；更新后持久化；嵌套字段深合并不丢默认值；`chrome.storage.local` 抛错时映射为 `STORAGE_ERROR`（不抛异常、不显示成功） | ✅ |
| IndexedDB 仓储（10 项） | 任务创建/读回/更新/删除；重复 id 创建返回 `STORAGE_ERROR`（`add` 语义）；更新不产生重复记录；笔记/文案/活动记录写入；`resetDbForTests` 后数据清空 | ✅ |
| 诊断与分类（10 项） | 不支持页面 → `UNSUPPORTED_PAGE`；未加载完成 → `PAGE_NOT_READY`；无候选 → `NO_VISIBLE_NOTES`；正常页面无错误且 `extracted=0`（阶段 2 不提取）；诊断 URL 不含查询参数；页面类型分类（搜索/详情/主页/其他） | ✅ |
| DOM 探针（13 项，jsdom） | 统计笔记卡片数、笔记链接数、结果容器数、SPA 挂载点、readyState（等待 load 后）；适配器 `isSupportedPage` / `getPageType` / `extractVisibleNotes` 返回空 / 诊断携带 `selectorVersion` 与候选数；非小红书页面的支持判定与类型 | ✅ |
| **消息层端到端（20 项）** | 用替身 `chrome.runtime.onMessage` 触发真实 SW 处理器：`task.create/list/update/set-status/duplicate/delete`、`settings.set-default-task`、`get-dashboard`（当前任务切换生效）、`read-page`（注入文件名 `content.js` + `func` 二次注入读回、诊断写入 `chrome.storage.local` 并可经 dashboard 回读）、非法输入 → `INVALID_INPUT`、非小红书页 → `UNSUPPORTED_PAGE`、无 url（未授权）→ `PERMISSION_DENIED`、无标签页 → 失败而非静默成功、未知消息名 → 返回 `false` 不占用通道、**且响应必须是单层信封**（不是 Result 套 Result） | ✅ |

### 本轮验证发现并已修复的缺陷（说明为什么必须有执行验证）

| # | 缺陷 | 影响 | 修复 |
|---|---|---|---|
| 1 | UI 发送 `{ input: TaskInput }`，而 `task.create` 处理器把整个 payload 当成 `TaskInput` 解析 | 新建任务**必然失败**（名称被读成 undefined → `INVALID_INPUT`），类型检查完全发现不了 | 处理器改为解构 `payload.input`；已加入消息层断言 |
| 2 | 命令处理器返回 `Result<T>`，消息路由器又包了一层信封 | 所有 UI 调用拿到「Result 套 Result」，`data.tasks` 变成不可用对象，页面白屏/数据错乱 | 新增 `unwrap()`：服务层仍返回 `Result`，命令层拆包后返回纯值或抛 `AppError`，路由器只包一层；已加入端到端断言 |
| 3 | 内容脚本被打包为 IIFE（`var X = (function(){...})()`），脚本完成值为空 | `executeScript({files})` 返回的 `result` 是 `undefined` → 「读取诊断」在真实浏览器里必然报「内容脚本未返回结果」 | 改为两段式注入：content.js 把诊断写到 isolated world 的全局键，background 再注入自包含 `func` 读回；已加入断言 |

以上三处都是**跨层契约错误**，`tsc` 无法捕获（`payload as TaskInput` 是类型断言；双信封只有真实调用才暴露；IIFE 完成值要看打包产物），只有真实跑一遍构建与消息链路才会暴露 —— 这也是本阶段必须做端到端验证的原因。

### 红线核查（源码级）

| 检查 | 结论 |
|---|---|
| 是否存在自动发布评论 / 点赞 / 关注 / 私信代码 | 无（全仓库无点击、无表单提交、无平台接口调用） |
| 是否调用小红书内部接口 | 无（无 `fetch`/`XHR` 到任何域名；`grep` 可核对） |
| 是否读取 Cookie / 凭证 | 无（只用 `document.querySelectorAll` 统计结构信号） |
| 是否上传数据 | 无（无网络请求代码；数据只进 IndexedDB 与 `chrome.storage.local`） |
| 是否绕过登录 / 验证码 | 无（登录墙与验证码只做"检测 + 提示用户自行处理"） |
| 是否伪造数据 | 无（`extractVisibleNotes()` 在阶段 2 明确返回空数组） |

---

## 4. 关于 `.local-verify/`（为什么仓库里会有这个目录）

代理环境的沙箱禁止创建子进程（任何带管道 stdio 的 `spawn` 都返回 `EPERM`），因此 Vite 与 vitest 都无法启动（它们依赖 esbuild 子进程）。为了让核心逻辑仍然得到**真实执行**的验证，采用了替代证据链：

1. `tsc -p .local-verify/tsconfig.json` 把 `src/shared`、`src/data`、`src/services`、`src/content`（诊断与适配器）、`src/platform/storage.ts` 编译为 CommonJS；
2. `node .local-verify/out/.local-verify/verify.js` 直接 `require` 编译产物执行 87 项断言。

它**不替代** `npm test`：`tests/` 下的 vitest 套件仍需你在本机跑一次（覆盖同样的行为，且是交付给项目的正式测试）。若你不希望保留该目录，可直接删除 `.local-verify/`（`.gitignore` 已忽略其产物），不影响扩展与正式测试。

### 4.1 构建等价执行（`.local-verify/shadow-build.mjs`）

目的：证明**交付的源码与配置语义**能真正构建出可安装的 `dist/`，而不只是"类型能过"。

与交付配置的三点差异（均为绕开沙箱限制，不涉及业务代码）：

| 差异 | 交付配置 | 影子配置 | 原因 |
|---|---|---|---|
| 配置加载 | `vite.config.ts` 文件 | 内联对象（`configFile: false`） | Vite 5 一律用 esbuild 打包配置文件，沙箱内必然 `EPERM` |
| 转换器 | Vite 内置 esbuild | `ts.transpileModule` 插件 + `esbuild: false` | esbuild 需要子进程 |
| 依赖解析 | 默认 | react/react-dom/scheduler 别名到各自 production CJS 构建 | Vite 的 `vite:define` 插件即使在 `esbuild:false` 下仍强制调用 `esbuild.transform` 替换 `process.env.NODE_ENV`；别名后依赖图中不再出现该文本，插件自然不触发 |

入口、`entryFileNames`（`background` → `background.js`）、`publicDir`、两次构建顺序、lib IIFE 与 `emptyOutDir` 均与交付配置一致。执行结果（主构建 `✓ 70 modules transformed`，内容脚本构建 `✓ 9 modules transformed`）：

| 产物 | 大小 | 说明 |
|---|---|---|
| `manifest.json` | 644 B | 从 `public/` 复制 |
| `icons/icon16,48,128.png` | 212 / 428 / 1015 B | 同上 |
| `background.js` | 31.1 kB | 位于 manifest 指定路径；相对导入同目录 `assets/` 共享块 |
| `content.js` | 9.6 kB | **单文件 IIFE：`(function () { … })();`** |
| `sidepanel.html` / `options.html` | 572 / 583 B | `<title>广交会推广助手</title>` 编码正确；引用 `/assets/*.js/css` |
| `assets/*.js`、`assets/*.css` | 6.0 / 8.0 / 19.7 / 148.2 kB、5.1 kB | 页面入口 + 共享块 + 样式 |

**关键证据（缺陷 #3 的实证）**：内容脚本产物确实形如 `(function () { … })();` —— 这是没有返回值的表达式语句，`chrome.scripting.executeScript({ files: [...] })` 拿到的 `result` 只能是 `undefined`。因此两段式注入（写全局键 → 二次注入 `func` 读回）是**必要**的，不是过度设计。

### 4.2 测试等价执行（`.local-verify/shadow-test.mjs`）

用 `startVitest()` 内联配置执行**交付的** `tests/**/*.test.ts`，差异仅为：`config: false`（不走配置文件）、`esbuild: false` + tsc 转换插件、`pool: 'threads'`（worker_threads，不经过 `child_process`）、同样的生产 CJS 别名。

结果：

```text
 ✓ tests/unit/normalization.test.ts (12 tests)
 ✓ tests/unit/utils.test.ts (9 tests)
 ✓ tests/unit/settings-repository.test.ts (6 tests)
 ✓ tests/unit/task-service.test.ts (12 tests)
 ✓ tests/unit/diagnostics.test.ts (8 tests)
 ✓ tests/integration/repositories.test.ts (8 tests)
 ✓ tests/integration/message-layer.test.ts (11 tests)
 ✓ tests/unit/probe-dom.test.ts (6 tests)

 Test Files  8 passed (8)
      Tests  72 passed (72)
```

即：交付的 8 个测试文件、72 个用例全绿，退出码 0。你本机执行 `npm test` 时应看到同样的 8 文件 / 72 用例（报告格式可能略有差异）。

---

## 5. 已执行：本机构建与测试

执行环境：Windows / Node v24.19.0 / npm 11.17.0 / Chrome 150.0.7871.125。全部为本机真实执行（不再是影子配置）。

| # | 命令 | 预期 | 实际（已回填） |
|---|---|---|---|
| 1 | `node -v` | ≥ 18 | ✅ `v24.19.0` |
| 2 | `npm install` | 无 ERROR，`node_modules/` 生成 | ✅ `up to date in 1s`，退出码 0（有一条 `npm warn allow-scripts esbuild` 警告，不影响构建） |
| 3 | `npm run typecheck` | 无输出/0 错误 | ✅ 0 行输出，退出码 0 |
| 4 | `npm test` | 8 个测试文件 / **72 个用例**全部通过 | ✅ `Test Files 8 passed (8)`、`Tests 72 passed (72)`、退出码 0 |
| 5 | `npm run build` | 成功；`dist/` 含 `manifest.json`、`background.js`、`sidepanel.html`、`options.html`、`content.js`、`icons/`、`assets/` | ✅ 主构建 `✓ 85 modules transformed`、内容脚本 `✓ 9 modules`；`dist/` 共 13 个文件，结构齐备（另做了 32 项产物断言，全部 PASS） |
| 6 | `chrome://extensions` 加载 `dist/` | 无 manifest 错误、无红色错误 | ✅ 卡片「广交会推广助手 0.1.0 / 已启用」，做完 C/D 全部操作后仍无红色错误 |
| 7 | 点工具栏图标 | 侧边栏打开，显示「当前任务」与「读取当前页面诊断」 | ✅ 侧边栏打开（视口 360×668），元素齐备 |
| 8 | 管理页 → 任务 → 新建任务 | 保存后出现在列表；刷新页面仍在 | ✅ 列表出现「广交会 / 2 个 / 进行中」；F5 后仍在；重载扩展、完全关闭浏览器再打开后仍在 |
| 9 | 编辑/复制/暂停/删除任务 | 各操作生效；删除弹确认框；重新打开浏览器后数据仍在 | ✅ 改名同步、副本生成、状态实时切换、删除弹确认框（取消保留 / 确认才删） |

> 说明：`npm run build` 与 `npm test` 在代理环境曾因沙箱禁止子进程而无法直接执行（§4 的影子配置是那时的替代证据）。本机已直接执行成功，**影子证据不再是唯一依据**。

---

## 6. 已执行：真实页面探针协议（docs/04 §3）

前置：Chrome 150.0.7871.125；已加载 `dist/`；已登录本人小红书账号。
执行方式：用户本人手动操作，每步在侧边栏点「读取当前页面诊断」并复制 JSON（原文留档见 §6.2）。

| 步骤 | 操作 | 预期 | 实际观测（已回填） |
|---|---|---|---|
| 1 | 打开 xiaohongshu.com 并登录 | 正常登录 | ✅ 首页正常，账号为本人 |
| 2 | 搜索「广交会」，等待结果加载 | 出现笔记卡片 | ✅ 有结果卡片 |
| 3 | 在**该标签页**点扩展图标，打开侧边栏 | 侧边栏打开且不随点击消失 | ✅ 侧边栏保持打开 |
| 4 | 点「读取当前页面诊断」 | `pageType=search_results`，`noteSections > 0`，无错误码 | ✅ `pageType=search_results`；`pageUrl=www.xiaohongshu.com/search_result_ai`；`noteSections=22`；`exploreLinks=20`；`uniqueNoteLinks=20`；`resultContainers=1`；`appShellRendered=true`；`readyState=complete`；`totalCandidates=20`；`errors=[]`；`selectorVersion=probe-0.1.0` |
| 5 | 向下滚动加载更多后再次读取 | 候选笔记数增加 | ✅ **20 → 30**（`noteSections` 22→30、`uniqueNoteLinks` 20→30） |
| 6 | 换关键词「interpreter」再读取 | 候选集合变化，`totalCandidates` 明显不同 | ✅ `totalCandidates=28`（`exploreLinks=28`、`uniqueNoteLinks=28`），与第 4 步的 20 不同 |
| 7 | 打开笔记详情页后再读取 | `pageType=note_detail`（或明确提示不支持） | ✅ `pageType=note_detail`；`pageUrl=www.xiaohongshu.com/explore/6aaa3e9e000000002a0248d2`；结构计数与第 6 步完全一致（28/30/28），见观察 A |
| 8 | **新标签页**直接打开小红书（不在该页点图标）后读取 | 站点权限下**应能正常读到**（预期已修订，见 `docs/04` §3） | ✅ 未点图标也读到：`pageType=other`、`/explore`、`exploreLinks=90`、`noteSections=30`、`uniqueNoteLinks=60`、`totalCandidates=60`、`errors=[]` |
| 9 | 退出登录后再读取 | 阶段 2 只记录原始信号，不判定登录墙 | ⚠️ 已执行但**不能作为验证结论**：`loginWallDetected=false`，数值与第 8 步完全相同（90/30/60）。退出登录后页面重定向到 `/explore`，与第 8 步同页，无法区分"是否真的未登录"。判定规则排入阶段 3 |
| 10 | 触发验证码/风控场景后读取 | 有明确提示且**不尝试绕过** | ✅ 未触发验证码/滑块（用户记录「未触发」），本条只登记"未触发" |
| 11 | 汇总：日期 / Chrome 版本 / `selectorVersion` / 各步 `signals` 快照 | 形成完整记录 | ✅ 11/11 已记录；`selectorVersion=probe-0.1.0` |

### 6.1 复验记录（修复权限后，交付版 `dist` 实测）

**背景**：首次验收发现交付版（仅 `activeTab`）在「点图标开侧边栏」流程下拿不到页面授权，读取必然失败（`PERMISSION_DENIED`，硬证据见工作区 `阶段2验收报告.md` §5.2）。修复方式：`public/manifest.json` 增加 `host_permissions: ["*://*.xiaohongshu.com/*"]`，commit `6dc68af`，分支 `feat/deepseek-site-permission`。

**复验方式**：在 `chrome://extensions` 重载指向 `dist` 的卡片 → 重新打开侧边栏 → 在真实搜索结果页点「读取当前页面诊断」。

**复验结果（2026-10-18T14:43:37Z，即本地 22:43）**：

```json
{
  "durationMs": 0,
  "errors": [],
  "extracted": 0,
  "finishedAt": "2026-10-18T14:43:37.659Z",
  "isSupported": true,
  "pageType": "search_results",
  "pageUrl": "www.xiaohongshu.com/search_result_ai",
  "partial": 0,
  "selectorVersion": "probe-0.1.0",
  "signals": {
    "appShellRendered": true,
    "captchaDetected": false,
    "exploreLinks": 20,
    "loginWallDetected": false,
    "noteSections": 22,
    "readyState": "complete",
    "resultContainers": 1,
    "uniqueNoteLinks": 20
  },
  "skipReasons": {},
  "skipped": 0,
  "startedAt": "2026-10-18T14:43:37.659Z",
  "totalCandidates": 20
}
```

**判定：✅ 阻断缺陷已解除。** 交付版在真实页面上读出 `totalCandidates=20`、`errors=[]`，与站点权限测试版的数值完全一致；`durationMs=0` 是已知问题（只度量了 `buildDiagnostics` 的组装时间，不含注入/采集，见工作区 `阶段2验收报告.md` 问题 4），不影响读取能力。

### 6.2 各步原始 JSON 留档

11 步完整诊断 JSON 由用户导出为 `阶段2验证记录-20261018-2216.txt`（工作区根目录，不在仓库内）。复验 JSON 即 §6.1 全文。

### 6.3 给阶段 3 的三条观察

- **观察 A（详情页是叠加层）**：第 7 步的 `noteSections/exploreLinks/uniqueNoteLinks` 与第 6 步完全相同。原因是小红书用**叠加层**打开笔记详情：URL 变成 `/explore/<id>`，但底下的搜索结果 DOM 并未卸载。因此「页面类型」与「DOM 里有多少笔记卡片」是两件事，提取器必须按 `pageType` 分别取数，不能拿 `section.note-item` 的数量当详情页笔记数。
- **观察 B（第 8 步语义已变）**：站点权限是安装时授予、对整站长期有效的，与"是否在该页点过图标"无关，因此第 8 步**永远不会再出现权限提示**。`PERMISSION_DENIED` 分支仅保留为"当前标签不是小红书"或注入被拒的兜底。
- **观察 C（第 9 步无法在阶段 2 判定）**：`loginWallDetected` 在 `src/content/adapters/selectors.ts` 中硬编码 `false`，且第 9 步的数值与第 8 步完全相同，既未证实也未证伪。`LOGIN_REQUIRED` 的真实判定规则（依据哪个 DOM 信号/文案）排入阶段 3，与 T3.1 一起做。

> 阶段 2 的探针**不判定**登录墙与验证码（只输出原始信号）。步骤 9、10 的观测结果将直接决定阶段 3 的 `LOGIN_REQUIRED` / `CAPTCHA_OR_RISK_CONTROL` 判定规则怎么写 —— 请务必保留原始 JSON。

---

## 7. 阶段 3 依赖的实测信息清单

阶段 2 已采集到的部分已标注；**标 ⏳ 的必须在 T3.1 写提取器之前补采**，不许凭空猜选择器。

| # | 需要的信息 | 现状 | 依据 |
|---|---|---|---|
| 1 | 搜索结果页笔记卡片的**稳定选择器**（标题、链接、摘要、时间的 DOM 路径），以及 `noteSections`/`exploreLinks` 计数与真实卡片数是否一致 | 🟡 部分：`section.note-item` 在真实搜索页存在且随滚动增长（22→30）、`div.feeds-container` 命中 1 个、`a[href*="/explore/"]` 去重计数可用（20/30/28/60）。**卡片内部字段路径（标题/摘要/时间）尚未采集** | §6 第 4–6 步 |
| 2 | 发布时间文本的**真实格式**（"3 天前"、"2026-03-05"、绝对时间戳…） | ⏳ 未采集（探针刻意不读文本） | — |
| 3 | 滚动加载的触发方式与"新增卡片"的可观测特征 | 🟡 部分：滚动后 `noteSections` 22→30、`uniqueNoteLinks` 20→30，说明是增量追加而非整页替换；触发方式（滚到底/按钮）未记录 | §6 第 5 步 |
| 4 | 未登录/验证码场景下的**可观测信号**（哪个 class、哪段文案、是否跳转登录页） | ⏳ 未采集：`loginWallDetected` 硬编码 `false`；第 9 步数据与第 8 步完全相同，无法区分登录态 | §6 第 9、10 步 + 观察 C |
| 5 | 笔记详情页与个人主页的 URL 形态与页面类型判定结果 | ✅ 已采集：详情页 `www.xiaohongshu.com/explore/6aaa3e9e000000002a0248d2` → `pageType=note_detail`；搜索页真实路径是 `/search_result_ai`（不是 `/search_result`），`classifyPageType` 用前缀匹配已能覆盖，但建议阶段 3 改显式白名单并加测试；个人主页未单独采（第 8 步落在 `/explore` → `pageType=other`） | §6 第 4、7、8 步 |

> 阶段 3 的 T3.1（选择器固化）可以直接基于第 1、3、5 项开工；第 2、4 项需要额外一轮真实页面采集（在页面上打开开发者工具抄 DOM 路径，或给探针加一次性字段）。
