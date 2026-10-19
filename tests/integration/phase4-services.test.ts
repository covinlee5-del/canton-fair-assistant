// 阶段 4：文案库、活动记录与批量/评分服务集成测试
//
// 补测原因：Codex 交付的 copy-service / activity-service / relevance-service /
// bulkSetNoteStatus 在实现时没有任何测试覆盖，且 createCopy 里存在「isDefault 恒为 false
// 导致 setDefaultCopy 分支永不执行」的死代码。删除死代码后，这里补齐行为断言。

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTests } from '../../src/data/db';
import { CopyRepository } from '../../src/data/copy-repository';
import { ActivityRepository } from '../../src/data/activity-repository';
import { NoteRepository } from '../../src/data/note-repository';
import { TaskRepository } from '../../src/data/task-repository';
import {
  createCopy,
  deleteCopy,
  listCopies,
  setDefaultCopy,
  updateCopy,
} from '../../src/services/copy-service';
import { listActivities, recordActivity } from '../../src/services/activity-service';
import { scoreNote, scoreNotesForTask } from '../../src/services/relevance-service';
import {
  bulkSetNoteStatus,
  listNotes,
  saveNoteDrafts,
  setNoteStatus,
} from '../../src/services/note-service';
import { parseXhsTime } from '../../src/shared/utils/time';
import { ErrorCode } from '../../src/shared/types/base';
import { messageFor } from '../../src/shared/constants/error-codes';
import { ActivityAction } from '../../src/shared/types/activity';
import { NoteStatus } from '../../src/shared/types/note';
import { TaskCategory } from '../../src/shared/types/task';
import { DEFAULT_SETTINGS } from '../../src/shared/types/settings';
import type { CopyInput } from '../../src/shared/types/copy';
import type { NoteDraft } from '../../src/shared/types/extraction';
import type { Task } from '../../src/shared/types/task';

const parseTime = (raw: string | null): string | null => parseXhsTime(raw).iso;

function copyInput(overrides: Partial<CopyInput> = {}): CopyInput {
  return {
    name: '默认私信文案',
    content: '你好，请问需要中英陪同翻译吗？',
    language: 'zh',
    scenario: 'GENERAL',
    tags: ['广交会'],
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: '广交会翻译机会',
    keywords: ['广交会', 'Canton Fair'],
    language: 'mixed',
    category: TaskCategory.CANTON_FAIR,
    dateRange: { from: null, to: null },
    relevanceConfig: DEFAULT_SETTINGS.defaultRelevanceConfig,
    copyIds: [],
    status: 'ACTIVE',
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function draft(overrides: Partial<NoteDraft> = {}): NoteDraft {
  const noteId = overrides.noteId ?? '65f1a2b3c4d5e6f708192a3b';
  return {
    url: `https://www.xiaohongshu.com/explore/${noteId}`,
    canonicalUrl: `https://www.xiaohongshu.com/explore/${noteId}`,
    openUrl: `https://www.xiaohongshu.com/explore/${noteId}`,
    noteId,
    title: '广交会翻译兼职',
    snippet: null,
    timeText: '3 天前',
    publishedAtRaw: '3 天前',
    authorDisplayName: '小鹿',
    quality: 'complete',
    missingFields: [],
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDbForTests();
});

describe('T4.3 文案库 CRUD', () => {
  it('校验：名称或内容为空时拒绝', async () => {
    const repo = new CopyRepository();
    const noName = await createCopy(repo, copyInput({ name: '   ' }));
    expect(noName.ok).toBe(false);
    if (!noName.ok) expect(noName.error.code).toBe('INVALID_INPUT');

    const noContent = await createCopy(repo, copyInput({ content: '' }));
    expect(noContent.ok).toBe(false);
  });

  it('校验：非法语言或场景被拒绝', async () => {
    const repo = new CopyRepository();
    const badLang = await createCopy(
      repo,
      copyInput({ language: 'fr' as CopyInput['language'] }),
    );
    expect(badLang.ok).toBe(false);
    const badScenario = await createCopy(
      repo,
      copyInput({ scenario: 'NOT_A_SCENARIO' as CopyInput['scenario'] }),
    );
    expect(badScenario.ok).toBe(false);
  });

  it('第一条文案自动成为默认文案（修复前的死代码行为）', async () => {
    const repo = new CopyRepository();
    const first = await createCopy(repo, copyInput({ name: '第一条' }));
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.value.isDefault).toBe(true);

    const second = await createCopy(repo, copyInput({ name: '第二条' }));
    if (second.ok) expect(second.value.isDefault).toBe(false);

    const all = await listCopies(repo);
    if (all.ok) {
      expect(all.value).toHaveLength(2);
      expect(all.value.filter((c) => c.isDefault)).toHaveLength(1);
    }
  });

  it('标签去重并规范化', async () => {
    const repo = new CopyRepository();
    const created = await createCopy(
      repo,
      copyInput({ tags: ['  广交会 ', '广交会', 'Canton'] }),
    );
    if (created.ok) expect(created.value.tags).toEqual(['广交会', 'Canton']);
  });

  it('更新文案不产生新行，且保留默认标记', async () => {
    const repo = new CopyRepository();
    const created = await createCopy(repo, copyInput());
    if (!created.ok) return;
    const updated = await updateCopy(repo, created.value.id, copyInput({ name: '改名后' }));
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.value.name).toBe('改名后');
      expect(updated.value.isDefault).toBe(true);
    }
    const all = await repo.getAll();
    if (all.ok) expect(all.value).toHaveLength(1);
  });

  it('设置默认文案是全局唯一的（切换后旧的取消）', async () => {
    const repo = new CopyRepository();
    const a = await createCopy(repo, copyInput({ name: 'A' }));
    const b = await createCopy(repo, copyInput({ name: 'B' }));
    if (!a.ok || !b.ok) return;

    const set = await setDefaultCopy(repo, b.value.id);
    expect(set.ok).toBe(true);
    if (set.ok) expect(set.value.id).toBe(b.value.id);

    const all = await repo.getAll();
    if (all.ok) {
      expect(all.value.filter((c) => c.isDefault)).toHaveLength(1);
      expect(all.value.find((c) => c.isDefault)?.id).toBe(b.value.id);
    }
  });

  it('删除默认文案后不再有默认文案，且不影响其他文案', async () => {
    const repo = new CopyRepository();
    const a = await createCopy(repo, copyInput({ name: 'A' }));
    const b = await createCopy(repo, copyInput({ name: 'B' }));
    if (!a.ok || !b.ok) return;

    const removed = await deleteCopy(repo, a.value.id);
    expect(removed.ok).toBe(true);

    const all = await repo.getAll();
    if (all.ok) {
      expect(all.value).toHaveLength(1);
      expect(all.value[0]?.id).toBe(b.value.id);
      expect(all.value.filter((c) => c.isDefault)).toHaveLength(0);
    }
  });

  it('删除不存在的文案返回 INVALID_INPUT', async () => {
    const repo = new CopyRepository();
    const res = await deleteCopy(repo, 'missing');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('INVALID_INPUT');
  });
});

describe('T4.5 活动记录', () => {
  it('记录打开笔记与复制文案，不改变笔记状态', async () => {
    const repo = new ActivityRepository();
    const opened = await recordActivity(repo, {
      noteId: 'note-1',
      action: ActivityAction.OPEN_NOTE,
    });
    expect(opened.ok).toBe(true);
    if (opened.ok) {
      expect(opened.value.action).toBe(ActivityAction.OPEN_NOTE);
      expect(opened.value.noteId).toBe('note-1');
      expect(opened.value.taskId).toBeNull();
    }

    const copied = await recordActivity(repo, {
      noteId: 'note-1',
      action: ActivityAction.COPY_TEXT,
      copyId: 'copy-1',
    });
    if (copied.ok) expect(copied.value.copyId).toBe('copy-1');

    const all = await listActivities(repo);
    if (all.ok) expect(all.value).toHaveLength(2);
  });

  it('可按 noteId / taskId 过滤，并按时间倒序', async () => {
    const repo = new ActivityRepository();
    await recordActivity(repo, { noteId: 'a', taskId: 't1', action: ActivityAction.OPEN_NOTE });
    await recordActivity(repo, { noteId: 'b', taskId: 't2', action: ActivityAction.OPEN_NOTE });
    await recordActivity(repo, { noteId: 'a', taskId: 't2', action: ActivityAction.COPY_TEXT });

    const byNote = await listActivities(repo, { noteId: 'a' });
    if (byNote.ok) expect(byNote.value).toHaveLength(2);

    const byTask = await listActivities(repo, { taskId: 't2' });
    if (byTask.ok) expect(byTask.value).toHaveLength(2);

    const all = await listActivities(repo);
    if (all.ok) {
      // 时间倒序：最新的在前
      for (let i = 1; i < all.value.length; i += 1) {
        expect(all.value[i - 1]!.actionAt >= all.value[i]!.actionAt).toBe(true);
      }
    }
  });
});

describe('T4.2 评分服务与持久化', () => {
  it('scoreNote 写入展示用 relevance 与 relevanceByTask', () => {
    const task = makeTask();
    const note = {
      id: 'n1',
      title: '广交会陪同翻译',
      contentSnippet: null,
      publishedAt: null,
      relevance: {
        taskId: '',
        score: 0,
        level: 'low' as const,
        matchedKeywords: [],
        reasons: [],
        evaluatedAt: '',
      },
      relevanceByTask: {},
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as never;

    const scored = scoreNote(note, task);
    expect(scored.relevance.score).toBeGreaterThan(0);
    expect(scored.relevanceByTask[task.id]?.score).toBe(scored.relevance.score);
  });

  it('scoreNotesForTask 把评分落库', async () => {
    const noteRepo = new NoteRepository();
    const taskRepo = new TaskRepository();
    const task = makeTask();
    await taskRepo.create(task);
    await saveNoteDrafts(noteRepo, [draft()], { taskId: task.id, sourcePageUrl: 'x' }, parseTime);

    const notes = await noteRepo.listByTaskId(task.id);
    if (!notes.ok) return;

    const scored = await scoreNotesForTask(noteRepo, notes.value, task);
    expect(scored.ok).toBe(true);

    const all = await noteRepo.getAll();
    if (all.ok) expect(all.value[0]?.relevance.score).toBeGreaterThan(0);
  });

  it('不同任务的评分互相独立（同一笔记两条评分）', async () => {
    const noteRepo = new NoteRepository();
    await saveNoteDrafts(noteRepo, [draft()], { taskId: 'task-1', sourcePageUrl: 'x' }, parseTime);
    const notes = await noteRepo.getAll();
    if (!notes.ok) return;

    // task-b 用 OTHER 类别（预设词为空），关键词也完全不命中 → 应为 0 分
    const taskA = makeTask({ id: 'task-a', keywords: ['广交会'] });
    const taskB = makeTask({
      id: 'task-b',
      keywords: ['完全无关的词'],
      category: TaskCategory.OTHER,
    });
    const withA = scoreNote(notes.value[0]!, taskA);
    const withB = scoreNote(withA, taskB);

    expect(withB.relevanceByTask['task-a']?.score).toBeGreaterThan(0);
    expect(withB.relevanceByTask['task-b']?.score).toBe(0);
    // 展示用 relevance 是最后一次评估的结果
    expect(withB.relevance.taskId).toBe('task-b');
    expect(withB.relevanceByTask['task-a']?.taskId).toBe('task-a');
  });
});

describe('T4.6 列表筛选（关键词 / 状态 / 评分 / 排序）', () => {
  async function seed(): Promise<{ noteRepo: NoteRepository; taskA: Task; taskB: Task }> {
    const noteRepo = new NoteRepository();
    const taskA = makeTask({ id: 'task-a', keywords: ['广交会'] });
    const taskB = makeTask({ id: 'task-b', keywords: ['完全无关的词'], category: TaskCategory.OTHER });
    await saveNoteDrafts(
      noteRepo,
      [
        draft({ noteId: 'aaaaaaaaaaaaaaaaaaaaaaaa', title: '广交会翻译' }),
        draft({ noteId: 'bbbbbbbbbbbbbbbbbbbbbbbb', title: '普通日常分享', authorDisplayName: '路人' }),
      ],
      { taskId: 'task-a', sourcePageUrl: 'x' },
      parseTime,
    );
    const all = await noteRepo.getAll();
    if (!all.ok) throw new Error('seed failed');
    for (const note of all.value) {
      const withA = scoreNote(note, taskA);
      await noteRepo.upsert(scoreNote(withA, taskB));
    }
    return { noteRepo, taskA, taskB };
  }

  it('minScore 按所选任务视角过滤，而不是用全局展示分', async () => {
    const { noteRepo } = await seed();

    const forA = await listNotes(noteRepo, { taskId: 'task-a', minScore: 1 });
    expect(forA.ok).toBe(true);
    if (forA.ok) expect(forA.value.map((n) => n.title)).toEqual(['广交会翻译']);

    // task-b 对两条笔记都是 0 分 → 无论 minScore=1 与否都为空
    const forB = await listNotes(noteRepo, { taskId: 'task-b', minScore: 1 });
    if (forB.ok) expect(forB.value).toHaveLength(0);
  });

  it('返回的 relevance 是该任务视角的评分（relevanceByTask 覆盖展示分）', async () => {
    const { noteRepo } = await seed();
    const forA = await listNotes(noteRepo, { taskId: 'task-a' });
    if (!forA.ok) return;
    const matched = forA.value.find((n) => n.title === '广交会翻译');
    expect(matched?.relevance.taskId).toBe('task-a');
    expect(matched?.relevance.score).toBeGreaterThan(0);
  });

  it('关键词、状态与排序组合生效', async () => {
    const { noteRepo } = await seed();

    const byKeyword = await listNotes(noteRepo, { keyword: '广交会' });
    if (byKeyword.ok) expect(byKeyword.value).toHaveLength(1);

    const byStatus = await listNotes(noteRepo, { status: NoteStatus.NEW });
    if (byStatus.ok) expect(byStatus.value).toHaveLength(2);

    const byRelevance = await listNotes(noteRepo, { taskId: 'task-a', sortBy: 'relevance', sortOrder: 'desc' });
    if (byRelevance.ok) {
      expect(byRelevance.value[0]?.title).toBe('广交会翻译');
      expect(byRelevance.value[0]!.relevance.score).toBeGreaterThanOrEqual(byRelevance.value[1]!.relevance.score);
    }
  });
});

describe('T4.4 任务与文案关联隔离', () => {
  it('任务只展示自己关联的文案，删除文案时自动从任务解绑', async () => {
    const copyRepo = new CopyRepository();
    const taskRepo = new TaskRepository();
    const a = await createCopy(copyRepo, copyInput({ name: 'A 文案' }));
    const b = await createCopy(copyRepo, copyInput({ name: 'B 文案' }));
    if (!a.ok || !b.ok) return;

    const taskA = makeTask({ id: 'task-a', copyIds: [a.value.id] });
    const taskB = makeTask({ id: 'task-b', copyIds: [b.value.id] });
    await taskRepo.create(taskA);
    await taskRepo.create(taskB);

    // 文案页的隔离逻辑：按 task.copyIds 过滤
    const all = await listCopies(copyRepo);
    if (!all.ok) return;
    const forA = all.value.filter((copy) => taskA.copyIds.includes(copy.id));
    const forB = all.value.filter((copy) => taskB.copyIds.includes(copy.id));
    expect(forA.map((c) => c.name)).toEqual(['A 文案']);
    expect(forB.map((c) => c.name)).toEqual(['B 文案']);

    // 删除 A 文案 → task-a 的 copyIds 被清空，task-b 不受影响
    const removed = await deleteCopy(copyRepo, a.value.id, taskRepo);
    expect(removed.ok).toBe(true);

    const reloadedA = await taskRepo.getById('task-a');
    const reloadedB = await taskRepo.getById('task-b');
    if (reloadedA.ok) expect(reloadedA.value?.copyIds).toEqual([]);
    if (reloadedB.ok) expect(reloadedB.value?.copyIds).toEqual([b.value.id]);
  });
});

describe('T4.6 批量状态更新', () => {
  it('批量把多条笔记标为已审核', async () => {
    const noteRepo = new NoteRepository();
    const activityRepo = new ActivityRepository();
    await saveNoteDrafts(
      noteRepo,
      [
        draft({ noteId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }),
        draft({ noteId: 'bbbbbbbbbbbbbbbbbbbbbbbb' }),
      ],
      { taskId: 'task-1', sourcePageUrl: 'x' },
      parseTime,
    );
    const all = await noteRepo.getAll();
    if (!all.ok) return;
    const ids = all.value.map((n) => n.id);

    const result = await bulkSetNoteStatus(noteRepo, activityRepo, ids, NoteStatus.REVIEWED);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(2);

    const reread = await noteRepo.getAll();
    if (reread.ok) expect(reread.value.every((n) => n.status === NoteStatus.REVIEWED)).toBe(true);

    const activities = await activityRepo.getAll();
    if (activities.ok) expect(activities.value).toHaveLength(2);
  });

  it('批量中只要有一条非法转移就整体拒绝（事务语义）', async () => {
    const noteRepo = new NoteRepository();
    const activityRepo = new ActivityRepository();
    await saveNoteDrafts(
      noteRepo,
      [
        draft({ noteId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }),
        draft({ noteId: 'bbbbbbbbbbbbbbbbbbbbbbbb' }),
      ],
      { taskId: 'task-1', sourcePageUrl: 'x' },
      parseTime,
    );
    const all = await noteRepo.getAll();
    if (!all.ok) return;
    const ids = all.value.map((n) => n.id);

    // 先把第一条推到 IRRELEVANT（终态），再从 NEW 批量改为 CONTACTED
    await setNoteStatus(noteRepo, activityRepo, ids[0]!, NoteStatus.IRRELEVANT);

    const result = await bulkSetNoteStatus(noteRepo, activityRepo, ids, NoteStatus.CONTACTED);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // 真实页面复验暴露的 bug：文案曾是笼统的「输入内容不合法，请检查后重试。」
      // 用户看不出是哪一条、为什么。现在必须点名到具体笔记与当前状态。
      expect(result.error.code).toBe(ErrorCode.INVALID_INPUT);
      expect(result.error.message).not.toBe(messageFor(ErrorCode.INVALID_INPUT));
      expect(result.error.message).toContain('不相关');
      expect(result.error.message).toContain('已建立联系');
      expect(result.error.message).toContain('整批未执行');
      // 不允许出现「。。」这种拼接痕迹
      expect(result.error.message).not.toContain('。。');
    }

    const reread = await noteRepo.getAll();
    if (reread.ok) {
      // 第二条仍是 NEW（没有被部分更新）
      expect(reread.value.find((n) => n.id === ids[1])?.status).toBe(NoteStatus.NEW);
    }
  });

  it('批量去重相同 id，不重复写活动', async () => {
    const noteRepo = new NoteRepository();
    const activityRepo = new ActivityRepository();
    await saveNoteDrafts(noteRepo, [draft()], { taskId: 'task-1', sourcePageUrl: 'x' }, parseTime);
    const all = await noteRepo.getAll();
    if (!all.ok) return;
    const id = all.value[0]?.id as string;

    const result = await bulkSetNoteStatus(noteRepo, activityRepo, [id, id, id], NoteStatus.REVIEWED);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(1);

    const activities = await activityRepo.getAll();
    if (activities.ok) expect(activities.value).toHaveLength(1);
  });
});
