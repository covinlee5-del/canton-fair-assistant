// 消息层集成测试：用替身 chrome API 驱动真实的 Service Worker 处理器。
// 覆盖两类跨层契约错误（类型检查无法发现，只有真跑消息链才会暴露）：
//   1) UI 发送 { input } 而处理器把整个 payload 当 TaskInput；
//   2) 处理器返回 Result、路由器又包一层 → 出现 Result 套 Result。

import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDbForTests } from '../../src/data/db';
import { TaskCategory } from '../../src/shared/types/task';
import { ErrorCode } from '../../src/shared/types/base';
import { messageFor } from '../../src/shared/constants/error-codes';
import type { TaskInput } from '../../src/shared/types/task';

type Listener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => unknown;

const listeners: Listener[] = [];
const storage = new Map<string, unknown>();
const injectedFiles: string[] = [];

let currentTab: { id: number; url?: string } | null = {
  id: 1,
  url: 'https://www.xiaohongshu.com/search_result?keyword=Canton%20Fair',
};

const FAKE_DIAGNOSTICS = {
  selectorVersion: 'xhs-1.0.0',
  totalCandidates: 3,
  extracted: 2,
  partial: 0,
  skipped: 1,
  skipReasons: { 'no-identifiable-content': 1 },
  pageType: 'search_results',
  pageUrl: 'www.xiaohongshu.com/search_result',
  isSupported: true,
  signals: {
    noteSections: 3,
    exploreLinks: 2,
    uniqueNoteLinks: 2,
    resultContainers: 1,
    appShellRendered: true,
    readyState: 'complete',
    loginWallDetected: false,
    captchaDetected: false,
  },
  startedAt: '2026-03-10T00:00:00.000Z',
  finishedAt: '2026-03-10T00:00:00.000Z',
  durationMs: 1,
  errors: [],
};

/** 内容脚本返回的两条笔记草稿（与 FAKE_DIAGNOSTICS 的 extracted=2 对齐） */
const FAKE_DRAFTS = [
  {
    url: 'https://www.xiaohongshu.com/explore/65f1a2b3c4d5e6f708192a3b',
    canonicalUrl: 'https://www.xiaohongshu.com/explore/65f1a2b3c4d5e6f708192a3b',
    noteId: '65f1a2b3c4d5e6f708192a3b',
    title: '广交会翻译兼职第一天',
    snippet: null,
    timeText: '3 天前',
    publishedAtRaw: '3 天前',
    authorDisplayName: '小鹿翻译日记',
    quality: 'complete',
    missingFields: [],
  },
  {
    url: 'https://www.xiaohongshu.com/explore/65f1a2b3c4d5e6f708192a3c',
    canonicalUrl: 'https://www.xiaohongshu.com/explore/65f1a2b3c4d5e6f708192a3c',
    noteId: '65f1a2b3c4d5e6f708192a3c',
    title: 'Canton Fair 需要英语陪同翻译吗',
    snippet: '展位现场需要中英互译',
    timeText: '2026-03-05',
    publishedAtRaw: '2026-03-05',
    authorDisplayName: 'Buyer from Spain',
    quality: 'complete',
    missingFields: [],
  },
];

const chromeMock = {
  runtime: {
    onMessage: {
      addListener: (fn: Listener) => {
        listeners.push(fn);
      },
    },
    onInstalled: { addListener: () => undefined },
    getManifest: () => ({ version: '0.1.0' }),
    openOptionsPage: async () => undefined,
  },
  storage: {
    local: {
      async get(key: string): Promise<Record<string, unknown>> {
        return storage.has(key) ? { [key]: storage.get(key) } : {};
      },
      async set(record: Record<string, unknown>): Promise<void> {
        for (const [k, v] of Object.entries(record)) storage.set(k, v);
      },
      async remove(key: string): Promise<void> {
        storage.delete(key);
      },
    },
  },
  tabs: {
    query: async () => (currentTab ? [currentTab] : []),
  },
  scripting: {
    executeScript: async (opts: { files?: string[]; func?: unknown }) => {
      if (opts.files) {
        injectedFiles.push(...opts.files);
        // 注入 content.js 时脚本完成值为空（IIFE），与真实行为一致
        return [{ result: undefined }];
      }
      // 二次注入的读回函数：返回内容脚本写到全局键的诊断 + 草稿
      return [{ result: { diagnostics: FAKE_DIAGNOSTICS, notes: FAKE_DRAFTS } }];
    },
  },
  sidePanel: { setPanelBehavior: async () => undefined },
};

interface Envelope {
  ok: boolean;
  value?: unknown;
  error?: { code: string; message: string; detail?: string };
}

function send(name: string, payload: unknown): Promise<Envelope | undefined> {
  const listener = listeners[0];
  return new Promise<Envelope | undefined>((resolve) => {
    const ret = listener?.({ name, payload }, {}, resolve as (response: unknown) => void);
    if (ret !== true) resolve(undefined);
  });
}

function input(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    name: '广交会翻译机会',
    keywords: ['广交会', 'Canton Fair'],
    language: 'mixed',
    category: TaskCategory.CANTON_FAIR,
    dateRange: { from: null, to: null },
    relevanceConfig: null,
    copyIds: [],
    notes: '',
    ...overrides,
  };
}

beforeAll(async () => {
  vi.stubGlobal('chrome', chromeMock);
  // background/index 在导入时注册所有命令，因此必须在 chrome 替身就位后再导入
  await import('../../src/background/index');
});

beforeEach(async () => {
  await resetDbForTests();
  storage.clear();
  injectedFiles.length = 0;
  currentTab = { id: 1, url: 'https://www.xiaohongshu.com/search_result?keyword=Canton%20Fair' };
});

describe('消息层：任务命令', () => {
  it('task.create 读取 payload.input 并返回单层信封', async () => {
    const res = await send('task.create', { input: input() });
    expect(res?.ok).toBe(true);
    // 单层信封：res.value 直接是任务对象，而不是 { ok, value }
    expect((res?.value as { name?: string } | undefined)?.name).toBe('广交会翻译机会');
    expect(res?.value).not.toHaveProperty('ok');
  });

  it('task.create 非法输入返回 INVALID_INPUT', async () => {
    const res = await send('task.create', { input: input({ name: '   ' }) });
    expect(res?.ok).toBe(false);
    expect(res?.error?.code).toBe('INVALID_INPUT');
  });

  it('task.list 返回任务数组', async () => {
    await send('task.create', { input: input() });
    const res = await send('task.list', { includeArchived: false });
    expect(res?.ok).toBe(true);
    expect(Array.isArray(res?.value)).toBe(true);
    expect((res?.value as unknown[]).length).toBe(1);
  });

  it('task.update / set-status / duplicate / delete 全链路', async () => {
    const created = await send('task.create', { input: input() });
    const id = (created?.value as { id: string }).id;

    const updated = await send('task.update', { id, input: input({ name: '改名' }) });
    expect(updated?.ok).toBe(true);
    expect((updated?.value as { name: string }).name).toBe('改名');

    const paused = await send('task.set-status', { id, status: 'PAUSED' });
    expect(paused?.ok).toBe(true);
    expect((paused?.value as { status: string }).status).toBe('PAUSED');

    const duplicated = await send('task.duplicate', { id });
    expect(duplicated?.ok).toBe(true);
    const copyId = (duplicated?.value as { id: string }).id;
    expect(copyId).not.toBe(id);

    const deleted = await send('task.delete', { id: copyId });
    expect(deleted?.ok).toBe(true);
  });
});

describe('消息层：设置与首页', () => {
  it('设置默认任务后 get-dashboard 反映当前任务', async () => {
    const created = await send('task.create', { input: input() });
    const id = (created?.value as { id: string }).id;

    const before = await send('get-dashboard', {});
    expect((before?.value as { currentTask: unknown }).currentTask).toBeNull();

    const setDefault = await send('settings.set-default-task', { taskId: id });
    expect(setDefault?.ok).toBe(true);
    expect((setDefault?.value as { defaultTaskId: string }).defaultTaskId).toBe(id);

    const after = await send('get-dashboard', {});
    const data = after?.value as { currentTask: { id: string } | null; tasks: unknown[] };
    expect(data.currentTask?.id).toBe(id);
    expect(data.tasks.length).toBe(1);
  });
});

describe('消息层：读取页面', () => {
  it('小红书页面返回诊断 + 笔记清单、注入 content.js、并落库可回读', async () => {
    const res = await send('read-page', {});
    expect(res?.ok).toBe(true);
    const value = res?.value as {
      diagnostics: { totalCandidates: number; selectorVersion: string };
      notes: Array<{ id: string; title: string; dedupeKey: string }>;
      processed: { added: number; duplicates: number; total: number };
    };
    expect(value.diagnostics.totalCandidates).toBe(3);
    expect(value.diagnostics.selectorVersion).toBe('xhs-1.0.0');
    expect(value.notes).toHaveLength(2);
    expect(value.processed.added).toBe(2);
    expect(value.processed.duplicates).toBe(0);
    expect(injectedFiles).toContain('content.js');
    expect(storage.get('lastDiagnostics')).toBeTruthy();

    const dash = await send('get-dashboard', {});
    const data = dash?.value as {
      lastDiagnostics: { selectorVersion: string } | null;
      noteCount: number;
    };
    expect(data.lastDiagnostics?.selectorVersion).toBe('xhs-1.0.0');
    expect(data.noteCount).toBe(2);
  });

  it('同一页连续读取两次不产生重复行（第二次全部计入 duplicates）', async () => {
    const first = await send('read-page', {});
    expect((first?.value as { notes: unknown[] }).notes).toHaveLength(2);

    const second = await send('read-page', {});
    expect(second?.ok).toBe(true);
    const processed = (second?.value as { processed: { added: number; duplicates: number } })
      .processed;
    expect(processed.added).toBe(0);
    expect(processed.duplicates).toBe(2);

    const listed = await send('notes.list', {});
    expect((listed?.value as unknown[]).length).toBe(2);
  });

  it('非小红书页面返回 UNSUPPORTED_PAGE', async () => {
    currentTab = { id: 2, url: 'https://example.com/foo' };
    const res = await send('read-page', {});
    expect(res?.ok).toBe(false);
    expect(res?.error?.code).toBe('UNSUPPORTED_PAGE');
  });

  it('拿不到 url（非小红书页/未授权）返回 UNSUPPORTED_PAGE 且文案说明原因', async () => {
    currentTab = { id: 3 };
    const res = await send('read-page', {});
    expect(res?.ok).toBe(false);
    // 真实页面复验（verification-results §8 第 7 行）暴露：在 baidu.com 上 tab.url 不可读，
    // 旧代码报 PERMISSION_DENIED「请重新点击扩展图标」，把"不是小红书页"说成了"你点坏了"。
    // 绝大多数情况下真正原因是当前标签不是小红书，因此改判 UNSUPPORTED_PAGE。
    expect(res?.error?.code).toBe('UNSUPPORTED_PAGE');
    expect(res?.error?.message).toContain('不是小红书');
    expect(res?.error?.message).not.toBe(messageFor(ErrorCode.PERMISSION_DENIED));
  });

  it('无活动标签页时不静默成功', async () => {
    currentTab = null;
    const res = await send('read-page', {});
    expect(res?.ok).toBe(false);
  });
});

describe('消息层：笔记查询与状态（阶段 3 T3.6）', () => {
  async function seedNotes(): Promise<string> {
    const res = await send('read-page', {});
    const notes = (res?.value as { notes: Array<{ id: string }> }).notes;
    return notes[0]?.id as string;
  }

  it('notes.list 返回落库的笔记，可按关键词过滤', async () => {
    await seedNotes();
    const all = await send('notes.list', {});
    expect((all?.value as unknown[]).length).toBe(2);

    const filtered = await send('notes.list', { keyword: 'Canton' });
    const items = filtered?.value as Array<{ title: string }>;
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toContain('Canton Fair');
  });

  it('notes.list 可按状态过滤', async () => {
    const id = await seedNotes();
    await send('notes.set-note-status', { id, status: 'REVIEWED' });
    const reviewed = await send('notes.list', { status: 'REVIEWED' });
    expect((reviewed?.value as unknown[]).length).toBe(1);
    const fresh = await send('notes.list', { status: 'NEW' });
    expect((fresh?.value as unknown[]).length).toBe(1);
  });

  it('notes.set-note-status 合法转移生效并记录活动', async () => {
    const id = await seedNotes();
    const res = await send('notes.set-note-status', { id, status: 'REVIEWED' });
    expect(res?.ok).toBe(true);
    expect((res?.value as { status: string }).status).toBe('REVIEWED');

    // 状态机允许 REVIEWED → MARKED_FOR_CONTACT
    const next = await send('notes.set-note-status', { id, status: 'MARKED_FOR_CONTACT' });
    expect(next?.ok).toBe(true);
    expect((next?.value as { status: string }).status).toBe('MARKED_FOR_CONTACT');
  });

  it('notes.set-note-status 非法转移被拒绝（NEW → CONTACTED）', async () => {
    const id = await seedNotes();
    const res = await send('notes.set-note-status', { id, status: 'CONTACTED' });
    expect(res?.ok).toBe(false);
    expect(res?.error?.code).toBe('INVALID_INPUT');
    expect(res?.error?.detail).toContain('不允许的状态变更');
  });

  it('notes.set-note-status 未知状态被拒绝', async () => {
    const id = await seedNotes();
    const res = await send('notes.set-note-status', { id, status: 'NOT_A_STATUS' });
    expect(res?.ok).toBe(false);
    expect(res?.error?.code).toBe('INVALID_INPUT');
  });

  it('notes.set-note-status 不存在的笔记返回 INVALID_INPUT', async () => {
    const res = await send('notes.set-note-status', { id: 'missing-note', status: 'REVIEWED' });
    expect(res?.ok).toBe(false);
    expect(res?.error?.code).toBe('INVALID_INPUT');
  });
});

describe('消息层：路由健壮性', () => {
  it('未知消息名返回 false，不占用消息通道', () => {
    const listener = listeners[0];
    expect(listener?.({ name: 'not-a-real-message' }, {}, () => undefined)).toBe(false);
  });

  it('缺少 name 的消息被忽略', () => {
    const listener = listeners[0];
    expect(listener?.({ hello: 'world' }, {}, () => undefined)).toBe(false);
  });
});

describe('消息层：阶段 4 评分、文案与活动', () => {
  it('copies.* 支持创建、设默认、列表与删除', async () => {
    const created = await send('copies.create', { input: { name: '英文开场', content: 'Hello', language: 'en', scenario: 'GENERAL', tags: ['intro'] } });
    expect(created?.ok).toBe(true);
    const id = (created?.value as { id: string }).id;
    const selected = await send('copies.set-default', { id });
    expect((selected?.value as { isDefault: boolean }).isDefault).toBe(true);
    const list = await send('copies.list', {});
    expect((list?.value as unknown[]).length).toBe(1);
    expect((await send('copies.delete', { id }))?.ok).toBe(true);
  });

  it('notes.score-task 写入当前任务评分，notes.list 返回评分', async () => {
    const task = await send('task.create', { input: input() });
    const taskId = (task?.value as { id: string }).id;
    await send('settings.set-default-task', { taskId });
    await send('read-page', {});
    const scored = await send('notes.score-task', { taskId });
    expect(scored?.ok).toBe(true);
    const listed = await send('notes.list', { taskId, sortBy: 'relevance' });
    expect((listed?.value as Array<{ relevance: { taskId: string } }>)[0]?.relevance.taskId).toBe(taskId);
  });

  it('notes.bulk-set-status 和 activity.record 可用', async () => {
    const first = await send('read-page', {});
    const ids = (first?.value as { notes: Array<{ id: string }> }).notes.map((note) => note.id);
    const bulk = await send('notes.bulk-set-status', { ids, status: 'REVIEWED' });
    expect(bulk?.ok).toBe(true);
    const activity = await send('activity.record', { noteId: ids[0], action: 'OPEN_NOTE' });
    expect(activity?.ok).toBe(true);

    // 按 docs/03 §4：每次状态变更写一条活动，OPEN_NOTE 另记一条 —— 因此 ids[0] 共 2 条
    const activities = await send('activity.list', { noteId: ids[0] });
    const records = activities?.value as Array<{ action: string }>;
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.action).sort()).toEqual(['MARK_REVIEWED', 'OPEN_NOTE']);
  });
});
