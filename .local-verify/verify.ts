// 本地执行验证（沙箱内无法运行 Vite/vitest 时的替代证据链）
// 方式：tsc 编译本目录 + src 子集为 CommonJS → Node 直接执行真实代码路径。
// 注意：这是对已交付逻辑的补充验证，不替代你本机的 `npm test` 与 `npm run build`。

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const require: (id: string) => any;
declare const __dirname: string;
declare const process: {
  exitCode?: number;
  argv: string[];
  on(event: string, cb: () => void): void;
};

require('fake-indexeddb/auto');

const failures: string[] = [];
let checks = 0;

function ok(cond: unknown, name: string): void {
  checks += 1;
  if (!cond) failures.push(name);
}

function eq(actual: unknown, expected: unknown, name: string): void {
  checks += 1;
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) failures.push(`${name}（期望 ${b}，实际 ${a}）`);
}

const R = (path: string): any => require(`../${path}`);

async function main(): Promise<void> {
  // ---------- 1. 链接规范化 ----------
  const norm = R('src/shared/domain/normalization');
  const NOTE_ID = '65f1a2b3c4d5e6f708192a3b';
  eq(
    norm.canonicalizeNoteUrl(`https://www.xiaohongshu.com/explore/${NOTE_ID}?xsec_token=abc`),
    `https://www.xiaohongshu.com/explore/${NOTE_ID}`,
    'canonicalizeNoteUrl 丢弃查询参数',
  );
  eq(
    norm.canonicalizeNoteUrl(`https://www.xiaohongshu.com/discovery/item/${NOTE_ID}?source=x`),
    `https://www.xiaohongshu.com/explore/${NOTE_ID}`,
    'canonicalizeNoteUrl 归一 discovery 路径',
  );
  eq(norm.canonicalizeNoteUrl(`https://example.com/explore/${NOTE_ID}`), null, '非小红书域名返回 null');
  eq(
    norm.canonicalizeNoteUrl(`https://xiaohongshu.com.evil.example/explore/${NOTE_ID}`),
    null,
    '相似域名不被误判',
  );
  eq(norm.canonicalizeNoteUrl('https://www.xiaohongshu.com/explore/'), null, '缺少笔记 ID 返回 null');
  eq(norm.canonicalizeNoteUrl('not a url'), null, '非法 URL 返回 null');
  eq(norm.extractNoteId(`https://www.xiaohongshu.com/explore/${NOTE_ID}`), NOTE_ID, '提取笔记 ID');
  eq(
    norm.toPrivacySafePageUrl('https://www.xiaohongshu.com/search_result?keyword=广交会&xsec_token=secret'),
    'www.xiaohongshu.com/search_result',
    '隐私安全 URL 去除查询参数',
  );

  // ---------- 2. 文本与 Result 工具 ----------
  const text = R('src/shared/utils/text');
  const result = R('src/shared/utils/result');
  const time = R('src/shared/utils/time');
  const base = R('src/shared/types/base');
  eq(text.normalizeText('  广交会 \n 翻译  '), '广交会 翻译', 'normalizeText 折叠空白');
  eq(text.normalizeText(null), '', 'normalizeText null 安全');
  eq(text.truncateText('a'.repeat(30), 10).length, 10, 'truncateText 截断长度');
  eq(text.dedupeCaseInsensitive(['Canton', 'canton', 'Fair']), ['Canton', 'Fair'], '大小写不敏感去重');

  const appErr = result.appError(base.ErrorCode.PERMISSION_DENIED, 'detail');
  eq(appErr.code, 'PERMISSION_DENIED', 'appError 错误码');
  ok(typeof appErr.message === 'string' && appErr.message.length > 0, 'appError 有用户文案');
  eq(result.toAppError(appErr), appErr, 'toAppError 透传 AppError');
  eq(result.toAppError(new Error('boom')).code, 'UNKNOWN_ERROR', 'toAppError 包装未知异常');
  eq(time.formatDateTime(null), '—', 'formatDateTime 空值占位');

  // ---------- 3. 任务服务（内存仓储） ----------
  const svc = R('src/services/task-service');
  const taskTypes = R('src/shared/types/task');

  const store = new Map<string, any>();
  const memoryRepo = {
    async getAll() {
      return result.ok(Array.from(store.values()));
    },
    async getById(id: string) {
      return result.ok(store.get(id) ?? null);
    },
    async create(item: any) {
      store.set(item.id, item);
      return result.ok(item);
    },
    async update(item: any) {
      store.set(item.id, item);
      return result.ok(item);
    },
    async delete(id: string) {
      store.delete(id);
      return result.ok(undefined);
    },
  };

  const input = (over: Record<string, unknown> = {}) => ({
    name: '广交会翻译机会',
    keywords: ['广交会', 'Canton Fair'],
    language: 'mixed',
    category: taskTypes.TaskCategory.CANTON_FAIR,
    dateRange: { from: null, to: null },
    relevanceConfig: null,
    copyIds: [],
    notes: '',
    ...over,
  });

  const badName = svc.validateTaskInput(input({ name: '   ' }));
  ok(!badName.ok && badName.error.code === 'INVALID_INPUT', '空名称被拒绝');
  const noKeywords = svc.validateTaskInput(input({ keywords: ['', '  '] }));
  ok(!noKeywords.ok, '无有效关键词被拒绝');
  const dedup = svc.validateTaskInput(input({ keywords: [' Canton Fair ', 'canton fair', '广交会'] }));
  ok(dedup.ok && JSON.stringify(dedup.value.keywords) === JSON.stringify(['Canton Fair', '广交会']), '关键词去重规范化');

  const created = await svc.createTask(memoryRepo as any, input());
  ok(created.ok && created.value.status === 'ACTIVE', '创建任务默认 ACTIVE');
  ok(created.ok && created.value.relevanceConfig.highThreshold > 0, '创建任务补齐默认相关性规则');
  const createdId: string = created.ok ? created.value.id : '';

  const updated = await svc.updateTask(memoryRepo as any, createdId, input({ name: '新名称' }));
  ok(updated.ok && updated.value.id === createdId && updated.value.name === '新名称', '更新任务保留 id 并改名');

  const copy = await svc.duplicateTask(memoryRepo as any, createdId);
  ok(copy.ok && copy.value.id !== createdId && copy.value.name.includes('副本'), '复制任务生成新 id');
  eq(store.size, 2, '复制后任务数为 2');

  const badStatus = await svc.setTaskStatus(memoryRepo as any, createdId, 'BROKEN');
  ok(!badStatus.ok, '非法状态被拒绝');

  await svc.setTaskStatus(memoryRepo as any, createdId, 'ARCHIVED');
  const visible = await svc.listTasks(memoryRepo as any, false);
  const all = await svc.listTasks(memoryRepo as any, true);
  eq(visible.ok ? visible.value.length : -1, 1, '默认列表过滤归档');
  eq(all.ok ? all.value.length : -1, 2, '含归档列表返回全部');

  const del = await svc.deleteTask(memoryRepo as any, copiedIdSafe(copy));
  ok(del.ok, '删除任务成功');

  function copiedIdSafe(c: any): string {
    return c.ok ? c.value.id : '';
  }

  // ---------- 4. 设置仓库（chrome.storage.local 模拟） ----------
  const settingsStore = new Map<string, unknown>();
  (globalThis as any).chrome = {
    storage: {
      local: {
        async get(key: string) {
          return settingsStore.has(key) ? { [key]: settingsStore.get(key) } : {};
        },
        async set(record: Record<string, unknown>) {
          for (const [k, v] of Object.entries(record)) settingsStore.set(k, v);
        },
        async remove(key: string) {
          settingsStore.delete(key);
        },
      },
    },
  };

  const settingsMod = R('src/data/settings-repository');
  const settingsRepo = new settingsMod.LocalSettingsRepository();
  const defaults = await settingsRepo.get();
  ok(defaults.ok && defaults.value.defaultTaskId === null, '首次读取设置返回默认值');

  const patched = await settingsRepo.update({ defaultTaskId: 'task-1' });
  const reread = await settingsRepo.get();
  ok(patched.ok && reread.ok && reread.value.defaultTaskId === 'task-1', '设置更新后持久化');

  const merged = settingsMod.mergeSettings(null, { privacy: { keepDiagnostics: false } });
  eq(merged.privacy.keepDiagnostics, false, 'mergeSettings 覆盖嵌套字段');
  eq(merged.uiPrefs.theme, 'system', 'mergeSettings 保留其他默认字段');

  (globalThis as any).chrome = {
    storage: {
      local: {
        async get() {
          throw new Error('quota exceeded');
        },
        async set() {
          throw new Error('quota exceeded');
        },
      },
    },
  };
  const failedGet = await settingsRepo.get();
  ok(
    !failedGet.ok && failedGet.error.code === 'STORAGE_ERROR' && String(failedGet.error.detail).includes('quota'),
    '存储异常映射为 STORAGE_ERROR',
  );

  // ---------- 5. IndexedDB 仓储（fake-indexeddb） ----------
  const dbMod = R('src/data/db');
  const TaskRepo = R('src/data/task-repository').TaskRepository;
  const NoteRepo = R('src/data/note-repository').NoteRepository;
  const CopyRepo = R('src/data/copy-repository').CopyRepository;
  const ActivityRepo = R('src/data/activity-repository').ActivityRepository;
  const settingsTypes = R('src/shared/types/settings');
  const noteTypes = R('src/shared/types/note');
  const activityTypes = R('src/shared/types/activity');

  await dbMod.resetDbForTests();

  const now = new Date().toISOString();
  const taskRepo = new TaskRepo();
  const task = {
    id: 'task-db-1',
    name: '广交会翻译',
    keywords: ['广交会'],
    language: 'mixed',
    category: taskTypes.TaskCategory.CANTON_FAIR,
    dateRange: { from: null, to: null },
    relevanceConfig: settingsTypes.DEFAULT_SETTINGS.defaultRelevanceConfig,
    copyIds: [],
    status: 'ACTIVE',
    notes: '',
    createdAt: now,
    updatedAt: now,
  };
  const createdDb = await taskRepo.create(task);
  ok(createdDb.ok, 'IndexedDB 创建任务成功');
  const readDb = await taskRepo.getById('task-db-1');
  ok(readDb.ok && readDb.value?.name === '广交会翻译', 'IndexedDB 读回任务');
  const dup = await taskRepo.create(task);
  ok(!dup.ok && dup.error.code === 'STORAGE_ERROR', '重复 id 创建返回 STORAGE_ERROR');
  const updatedDb = await taskRepo.update({ ...task, name: '改名', status: 'PAUSED' });
  ok(updatedDb.ok, 'IndexedDB 更新成功');
  const allDb = await taskRepo.getAll();
  ok(allDb.ok && allDb.value.length === 1 && allDb.value[0].status === 'PAUSED', '更新不产生重复记录');
  const deletedDb = await taskRepo.delete('task-db-1');
  const goneDb = await taskRepo.getById('task-db-1');
  ok(deletedDb.ok && goneDb.ok && goneDb.value === null, 'IndexedDB 删除后不可读');

  const noteRepo = new NoteRepo();
  const noteCreated = await noteRepo.create({
    id: 'note-1',
    canonicalUrl: `https://www.xiaohongshu.com/explore/${NOTE_ID}`,
    dedupeKey: `url:${NOTE_ID}`,
    dedupeKeyType: 'url',
    title: '标题',
    contentSnippet: '摘要',
    publishedAt: null,
    publishedAtRaw: '3 天前',
    authorDisplayName: '用户',
    relevance: {
      taskId: 'task-a',
      score: 60,
      level: 'high',
      matchedKeywords: ['广交会'],
      reasons: [],
      evaluatedAt: now,
    },
    relevanceByTask: {},
    sourcePageUrl: 'www.xiaohongshu.com/search_result',
    extractedAt: now,
    extractionVersion: 'probe-0.1.0',
    extractionQuality: 'partial',
    taskIds: ['task-a'],
    status: noteTypes.NoteStatus.NEW,
    userNotes: '',
    createdAt: now,
    updatedAt: now,
  });
  ok(noteCreated.ok, 'IndexedDB 创建笔记成功');

  const copyRepo = new CopyRepo();
  ok(
    (
      await copyRepo.create({
        id: 'copy-1',
        name: '默认文案',
        content: '你好！',
        language: 'zh',
        scenario: 'GENERAL',
        tags: [],
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      })
    ).ok,
    'IndexedDB 创建文案成功',
  );

  const activityRepo = new ActivityRepo();
  ok(
    (
      await activityRepo.create({
        id: 'act-1',
        noteId: null,
        taskId: null,
        action: activityTypes.ActivityAction.OPEN_NOTE,
        actionAt: now,
      })
    ).ok,
    'IndexedDB 创建活动成功',
  );

  await dbMod.resetDbForTests();
  const afterReset = await taskRepo.getAll();
  ok(afterReset.ok && afterReset.value.length === 0, '重置后数据库为空');

  // ---------- 6. 诊断与页面分类 ----------
  const diagMod = R('src/content/diagnostics');
  const adapterMod = R('src/content/adapters/xiaohongshu-adapter');

  const signals = (over: Record<string, unknown> = {}) => ({
    noteSections: 0,
    exploreLinks: 0,
    uniqueNoteLinks: 0,
    resultContainers: 0,
    appShellRendered: true,
    readyState: 'complete',
    loginWallDetected: false,
    captchaDetected: false,
    ...over,
  });

  const unsupported = diagMod.buildDiagnostics({
    pageUrl: 'https://example.com/search',
    supported: false,
    host: 'example.com',
    pageType: 'other',
    signals: signals(),
    candidates: 0,
  });
  ok(
    unsupported.errors.some((e: any) => e.code === 'UNSUPPORTED_PAGE'),
    '不支持页面写入 UNSUPPORTED_PAGE',
  );

  const notReady = diagMod.buildDiagnostics({
    pageUrl: 'https://www.xiaohongshu.com/search_result',
    supported: true,
    host: 'www.xiaohongshu.com',
    pageType: 'search_results',
    signals: signals({ readyState: 'loading' }),
    candidates: 0,
  });
  ok(
    notReady.errors.some((e: any) => e.code === 'PAGE_NOT_READY'),
    '未加载完成写入 PAGE_NOT_READY',
  );

  const empty = diagMod.buildDiagnostics({
    pageUrl: 'https://www.xiaohongshu.com/search_result?keyword=x',
    supported: true,
    host: 'www.xiaohongshu.com',
    pageType: 'search_results',
    signals: signals(),
    candidates: 0,
  });
  ok(empty.errors.some((e: any) => e.code === 'NO_VISIBLE_NOTES'), '无候选笔记写入 NO_VISIBLE_NOTES');
  eq(empty.pageUrl, 'www.xiaohongshu.com/search_result', '诊断 URL 不含查询参数');

  const healthy = diagMod.buildDiagnostics({
    pageUrl: 'https://www.xiaohongshu.com/search_result',
    supported: true,
    host: 'www.xiaohongshu.com',
    pageType: 'search_results',
    signals: signals({ noteSections: 5, exploreLinks: 5, uniqueNoteLinks: 5 }),
    candidates: 5,
  });
  eq(healthy.errors.length, 0, '有候选笔记时无错误');
  eq(healthy.extracted, 0, '阶段 2 不提取笔记（extracted 为 0）');

  eq(adapterMod.classifyPageType('/search_result'), 'search_results', '分类：搜索结果页');
  eq(adapterMod.classifyPageType(`/explore/${NOTE_ID}`), 'note_detail', '分类：笔记详情页');
  eq(adapterMod.classifyPageType('/user/profile/abc'), 'profile', '分类：个人主页');
  eq(adapterMod.classifyPageType('/'), 'other', '分类：其他');

  // ---------- 7. DOM 探针（jsdom 模拟页） ----------
  const { JSDOM } = require('jsdom');
  const selectorsMod = R('src/content/adapters/selectors');
  const html = `<!DOCTYPE html><html><body><div id="app"><div class="feeds-container">
    <section class="note-item"><a href="https://www.xiaohongshu.com/explore/${NOTE_ID}">n1</a></section>
    <section class="note-item"><a href="https://www.xiaohongshu.com/explore/${NOTE_ID}?xsec_token=t">n2</a></section>
    <section class="note-item"><a href="https://www.xiaohongshu.com/discovery/item/65f1a2b3c4d5e6f708192a3c">n3</a></section>
  </div></div></body></html>`;
  const dom = new JSDOM(html);
  // 等待 load 事件后再取信号：真实场景中用户点击“读取”时页面已加载完成
  await new Promise<void>((resolve) => {
    if (dom.window.document.readyState === 'complete') {
      resolve();
      return;
    }
    dom.window.addEventListener('load', () => resolve());
  });
  const doc = dom.window.document;
  const sig = selectorsMod.collectSignals(doc);
  eq(sig.noteSections, 3, 'jsdom：统计笔记卡片数');
  eq(sig.exploreLinks, 3, 'jsdom：统计笔记链接数');
  eq(sig.resultContainers, 1, 'jsdom：统计结果容器数');
  eq(sig.appShellRendered, true, 'jsdom：识别 SPA 挂载点');
  ok(sig.readyState === 'complete', 'jsdom：readyState 为 complete');

  const adapter = adapterMod.createXiaohongshuAdapter(
    'https://www.xiaohongshu.com/search_result?keyword=Canton%20Fair',
    doc,
  );
  ok(adapter.isSupportedPage(), '适配器识别支持页面');
  eq(adapter.getPageType(), 'search_results', '适配器返回页面类型');
  eq(adapter.extractVisibleNotes().length, 0, '阶段 2 不产生笔记草稿（不伪造数据）');
  const adapterDiag = adapter.getExtractionDiagnostics();
  eq(adapterDiag.selectorVersion, selectorsMod.SELECTOR_VERSION, '诊断携带选择器版本');
  eq(adapterDiag.totalCandidates, 3, '诊断候选数为去重前链接数');
  eq(adapterDiag.pageUrl, 'www.xiaohongshu.com/search_result', '适配器诊断不含查询参数');

  const otherAdapter = adapterMod.createXiaohongshuAdapter('https://example.com/foo', doc);
  ok(!otherAdapter.isSupportedPage(), '非小红书页面不支持');
  eq(otherAdapter.getPageType(), 'other', '非小红书页面类型为 other');

  // ---------- 8. 消息层端到端（模拟 chrome.runtime / tabs / scripting） ----------
  const messageListeners: Array<(m: unknown, s: unknown, r: (x: unknown) => void) => unknown> = [];
  const storageMock: Record<string, unknown> = {};
  let currentTab: { id: number; url?: string } | null = {
    id: 1,
    url: 'https://www.xiaohongshu.com/search_result?keyword=Canton%20Fair',
  };
  let injectedFiles: string[] = [];
  let functionInjections = 0;

  const diagForRead = diagMod.buildDiagnostics({
    pageUrl: 'https://www.xiaohongshu.com/search_result?keyword=x',
    supported: true,
    host: 'www.xiaohongshu.com',
    pageType: 'search_results',
    signals: signals({ noteSections: 4, exploreLinks: 4, uniqueNoteLinks: 4 }),
    candidates: 4,
  });

  (globalThis as any).chrome = {
    runtime: {
      onMessage: {
        addListener: (fn: any) => {
          messageListeners.push(fn);
        },
      },
      onInstalled: { addListener: () => {} },
      getManifest: () => ({ version: '0.1.0' }),
      openOptionsPage: async () => {},
      sendMessage: async () => {
        throw new Error('harness 不使用 runtime.sendMessage');
      },
    },
    storage: {
      local: {
        async get(key: string) {
          return storageMock[key] === undefined ? {} : { [key]: storageMock[key] };
        },
        async set(record: Record<string, unknown>) {
          Object.assign(storageMock, record);
        },
        async remove(key: string) {
          delete storageMock[key];
        },
      },
    },
    tabs: { query: async () => (currentTab ? [currentTab] : []) },
    scripting: {
      executeScript: async (opts: { files?: string[]; func?: unknown }) => {
        if (opts.files) injectedFiles = opts.files;
        if (typeof opts.func === 'function') functionInjections += 1;
        return [{ result: diagForRead }];
      },
    },
    sidePanel: { setPanelBehavior: async () => {} },
  };

  await dbMod.resetDbForTests();
  R('src/background/index'); // 注册全部命令

  function call(name: string, payload: unknown): Promise<any> {
    const fn = messageListeners[0];
    if (!fn) throw new Error('未注册 onMessage 监听器');
    return new Promise<any>((resolve) => {
      const ret = fn({ name, payload }, {}, resolve);
      if (ret !== true) resolve(undefined);
    });
  }

  const createdMsg = await call('task.create', { input: input() });
  ok(
    createdMsg?.ok === true && createdMsg.value?.name === '广交会翻译机会',
    '消息层 task.create 返回单层信封（不是 Result 套 Result）',
  );
  const createdMsgId: string = createdMsg?.value?.id ?? '';

  const listedMsg = await call('task.list', { includeArchived: false });
  ok(listedMsg?.ok === true && listedMsg.value.length === 1, '消息层 task.list 返回任务数组');

  const dash1 = await call('get-dashboard', {});
  ok(
    dash1?.ok === true && dash1.value.tasks.length === 1 && dash1.value.currentTask === null,
    '消息层 get-dashboard 初始无当前任务',
  );

  const setDefaultMsg = await call('settings.set-default-task', { taskId: createdMsgId });
  ok(setDefaultMsg?.ok === true && setDefaultMsg.value.defaultTaskId === createdMsgId, '消息层设置默认/当前任务');

  const dash2 = await call('get-dashboard', {});
  ok(dash2?.ok === true && dash2.value.currentTask?.id === createdMsgId, '当前任务生效');

  const updatedMsg = await call('task.update', {
    id: createdMsgId,
    input: input({ name: '改过的名字' }),
  });
  ok(updatedMsg?.ok === true && updatedMsg.value.name === '改过的名字', '消息层 task.update');

  const pausedMsg = await call('task.set-status', { id: createdMsgId, status: 'PAUSED' });
  ok(pausedMsg?.ok === true && pausedMsg.value.status === 'PAUSED', '消息层 task.set-status');

  const dupMsg = await call('task.duplicate', { id: createdMsgId });
  ok(dupMsg?.ok === true && dupMsg.value.id !== createdMsgId, '消息层 task.duplicate');

  const readOkMsg = await call('read-page', {});
  ok(readOkMsg?.ok === true && readOkMsg.value.totalCandidates === 4, '消息层 read-page 返回诊断对象');
  ok(
    injectedFiles.length === 1 && injectedFiles[0] === 'content.js',
    '注入的文件名为 content.js（与构建产物一致）',
  );
  ok(functionInjections >= 1, '二次注入使用 func 从 isolated world 读回诊断结果');
  ok(
    typeof storageMock['lastDiagnostics'] === 'object' && storageMock['lastDiagnostics'] !== null,
    '诊断结果已写入 chrome.storage.local',
  );

  const dash3 = await call('get-dashboard', {});
  ok(
    dash3?.ok === true && dash3.value.lastDiagnostics?.selectorVersion === selectorsMod.SELECTOR_VERSION,
    '诊断已落库并可经 get-dashboard 回读',
  );

  const badCreate = await call('task.create', { input: input({ name: '   ' }) });
  ok(
    badCreate?.ok === false && badCreate.error.code === 'INVALID_INPUT',
    '非法输入 → 信封 ok:false 且错误码 INVALID_INPUT',
  );

  currentTab = { id: 2, url: 'https://example.com/foo' };
  const readUnsupported = await call('read-page', {});
  ok(
    readUnsupported?.ok === false && readUnsupported.error.code === 'UNSUPPORTED_PAGE',
    '非小红书页面 → UNSUPPORTED_PAGE',
  );

  currentTab = { id: 3 };
  const readNoUrl = await call('read-page', {});
  ok(
    readNoUrl?.ok === false && readNoUrl.error.code === 'PERMISSION_DENIED',
    'activeTab 未授权（拿不到 url）→ PERMISSION_DENIED',
  );

  currentTab = null;
  const readNoTab = await call('read-page', {});
  ok(readNoTab?.ok === false, '无活动标签页 → 失败而非静默成功');

  currentTab = { id: 1, url: 'https://www.xiaohongshu.com/search_result?keyword=x' };
  const delMsg = await call('task.delete', { id: dupMsg?.value?.id ?? '' });
  ok(delMsg?.ok === true, '消息层 task.delete');

  const listener = messageListeners[0];
  const unknownRet = listener?.({ name: 'not-a-real-message' }, {}, () => {});
  ok(unknownRet === false, '未知消息名返回 false（不占用通道）');
  const notAMessageRet = listener?.({ hello: 'world' }, {}, () => {});
  ok(notAMessageRet === false, '无 name 字段的消息被忽略');

  // ---------- 汇总 ----------
  console.log('');
  if (failures.length === 0) {
    console.log(`[local-verify] PASS 全部 ${checks} 项检查通过`);
  } else {
    console.log(`[local-verify] FAIL ${failures.length}/${checks} 项未通过：`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((cause: unknown) => {
  console.error('[local-verify] 执行异常：', cause);
  process.exitCode = 1;
});
