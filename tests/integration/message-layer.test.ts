// 消息层集成测试：用替身 chrome API 驱动真实的 Service Worker 处理器。
// 覆盖两类跨层契约错误（类型检查无法发现，只有真跑消息链才会暴露）：
//   1) UI 发送 { input } 而处理器把整个 payload 当 TaskInput；
//   2) 处理器返回 Result、路由器又包一层 → 出现 Result 套 Result。

import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDbForTests } from '../../src/data/db';
import { TaskCategory } from '../../src/shared/types/task';
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
  selectorVersion: 'probe-0.1.0',
  totalCandidates: 3,
};

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
      if (opts.files) injectedFiles.push(...opts.files);
      return [{ result: FAKE_DIAGNOSTICS }];
    },
  },
  sidePanel: { setPanelBehavior: async () => undefined },
};

interface Envelope {
  ok: boolean;
  value?: unknown;
  error?: { code: string; message: string };
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
  it('小红书页面返回诊断、注入 content.js、并落库可回读', async () => {
    const res = await send('read-page', {});
    expect(res?.ok).toBe(true);
    expect((res?.value as { totalCandidates: number }).totalCandidates).toBe(3);
    expect(injectedFiles).toContain('content.js');
    expect(storage.get('lastDiagnostics')).toBeTruthy();

    const dash = await send('get-dashboard', {});
    const diag = (dash?.value as { lastDiagnostics: { selectorVersion: string } | null })
      .lastDiagnostics;
    expect(diag?.selectorVersion).toBe('probe-0.1.0');
  });

  it('非小红书页面返回 UNSUPPORTED_PAGE', async () => {
    currentTab = { id: 2, url: 'https://example.com/foo' };
    const res = await send('read-page', {});
    expect(res?.ok).toBe(false);
    expect(res?.error?.code).toBe('UNSUPPORTED_PAGE');
  });

  it('拿不到 url（未授权）返回 PERMISSION_DENIED', async () => {
    currentTab = { id: 3 };
    const res = await send('read-page', {});
    expect(res?.ok).toBe(false);
    expect(res?.error?.code).toBe('PERMISSION_DENIED');
  });

  it('无活动标签页时不静默成功', async () => {
    currentTab = null;
    const res = await send('read-page', {});
    expect(res?.ok).toBe(false);
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
