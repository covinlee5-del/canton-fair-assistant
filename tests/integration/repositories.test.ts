// 数据访问层集成测试（fake-indexeddb，验证真实 IndexedDB 读写路径）

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTests } from '../../src/data/db';
import { TaskRepository } from '../../src/data/task-repository';
import { NoteRepository } from '../../src/data/note-repository';
import { CopyRepository } from '../../src/data/copy-repository';
import { ActivityRepository } from '../../src/data/activity-repository';
import { ActivityAction } from '../../src/shared/types/activity';
import { NoteStatus } from '../../src/shared/types/note';
import { TaskCategory } from '../../src/shared/types/task';
import { DEFAULT_SETTINGS } from '../../src/shared/types/settings';
import type { Task } from '../../src/shared/types/task';
import type { Note } from '../../src/shared/types/note';

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: `task-${Math.random().toString(36).slice(2)}`,
    name: '测试任务',
    keywords: ['广交会'],
    language: 'mixed',
    category: TaskCategory.CANTON_FAIR,
    dateRange: { from: null, to: null },
    relevanceConfig: DEFAULT_SETTINGS.defaultRelevanceConfig,
    copyIds: [],
    status: 'ACTIVE',
    notes: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeNote(taskId: string): Note {
  const now = new Date().toISOString();
  return {
    id: `note-${Math.random().toString(36).slice(2)}`,
    canonicalUrl: 'https://www.xiaohongshu.com/explore/65f1a2b3c4d5e6f708192a3b',
    dedupeKey: 'url:65f1a2b3c4d5e6f708192a3b',
    dedupeKeyType: 'url',
    title: '广交会需要翻译吗',
    contentSnippet: '摘要',
    publishedAt: null,
    publishedAtRaw: '3 天前',
    authorDisplayName: '某用户',
    relevance: {
      taskId,
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
    taskIds: [taskId],
    status: NoteStatus.NEW,
    userNotes: '',
    createdAt: now,
    updatedAt: now,
  };
}

beforeEach(async () => {
  await resetDbForTests();
});

describe('TaskRepository（IndexedDB）', () => {
  it('创建后可读回，字段完整', async () => {
    const repo = new TaskRepository();
    const task = makeTask({ name: '广交会翻译' });
    const created = await repo.create(task);
    expect(created.ok).toBe(true);

    const read = await repo.getById(task.id);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.value?.name).toBe('广交会翻译');
      expect(read.value?.keywords).toEqual(['广交会']);
    }
  });

  it('更新覆盖同 id 记录且不产生重复', async () => {
    const repo = new TaskRepository();
    const task = makeTask();
    await repo.create(task);
    const updated = await repo.update({ ...task, name: '改名后', status: 'PAUSED' });

    expect(updated.ok).toBe(true);
    const all = await repo.getAll();
    if (all.ok) {
      expect(all.value).toHaveLength(1);
      expect(all.value[0]?.name).toBe('改名后');
      expect(all.value[0]?.status).toBe('PAUSED');
    }
  });

  it('删除后读取为 null', async () => {
    const repo = new TaskRepository();
    const task = makeTask();
    await repo.create(task);
    const del = await repo.delete(task.id);
    expect(del.ok).toBe(true);
    const read = await repo.getById(task.id);
    if (read.ok) expect(read.value).toBeNull();
  });

  it('重复 id 创建返回 STORAGE_ERROR（add 语义）', async () => {
    const repo = new TaskRepository();
    const task = makeTask();
    await repo.create(task);
    const again = await repo.create(task);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('STORAGE_ERROR');
  });
});

describe('NoteRepository（IndexedDB）', () => {
  it('按 taskIds 多值索引可查询', async () => {
    const repo = new NoteRepository();
    const note = makeNote('task-a');
    await repo.create(note);
    const all = await repo.getAll();
    if (all.ok) {
      expect(all.value).toHaveLength(1);
      expect(all.value[0]?.taskIds).toContain('task-a');
    }
  });
});

describe('CopyRepository / ActivityRepository（IndexedDB）', () => {
  it('文案可创建并读回', async () => {
    const repo = new CopyRepository();
    const now = new Date().toISOString();
    const res = await repo.create({
      id: 'copy-1',
      name: '默认文案',
      content: '你好！',
      language: 'zh',
      scenario: 'GENERAL',
      tags: [],
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
    expect(res.ok).toBe(true);
    const all = await repo.getAll();
    if (all.ok) expect(all.value[0]?.content).toBe('你好！');
  });

  it('活动记录可创建并按时间读回', async () => {
    const repo = new ActivityRepository();
    const res = await repo.create({
      id: 'act-1',
      noteId: null,
      taskId: null,
      action: ActivityAction.OPEN_NOTE,
      actionAt: new Date().toISOString(),
    });
    expect(res.ok).toBe(true);
    const all = await repo.getAll();
    if (all.ok) {
      expect(all.value).toHaveLength(1);
      expect(all.value[0]?.action).toBe(ActivityAction.OPEN_NOTE);
    }
  });
});

describe('数据库隔离与重开', () => {
  it('resetDbForTests 后数据清空', async () => {
    const repo = new TaskRepository();
    await repo.create(makeTask());
    await resetDbForTests();
    const all = await repo.getAll();
    if (all.ok) expect(all.value).toHaveLength(0);
  });
});
