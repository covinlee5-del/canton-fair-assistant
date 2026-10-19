// 落库与任务关联集成测试（阶段 3 T3.5）
// 用 fake-indexeddb 走真实的 IndexedDB 读写路径（含 by-dedupeKey / by-taskIds 索引）。

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTests } from '../../src/data/db';
import { NoteRepository } from '../../src/data/note-repository';
import { ActivityRepository } from '../../src/data/activity-repository';
import { listNotes, saveNoteDrafts, setNoteStatus } from '../../src/services/note-service';
import { parseXhsTime } from '../../src/shared/utils/time';
import { NoteStatus } from '../../src/shared/types/note';
import type { NoteDraft } from '../../src/shared/types/extraction';

const parseTime = (raw: string | null): string | null => parseXhsTime(raw).iso;

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

const ctx = (taskId: string | null = 'task-1') => ({
  taskId,
  sourcePageUrl: 'www.xiaohongshu.com/search_result_ai',
});

beforeEach(async () => {
  await resetDbForTests();
});

describe('T3.5 落库与任务关联', () => {
  it('读取 → 写库 → 按任务查询', async () => {
    const repo = new NoteRepository();
    const saved = await saveNoteDrafts(repo, [draft()], ctx('task-1'), parseTime);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value.processed.added).toBe(1);

    const byTask = await repo.listByTaskId('task-1');
    expect(byTask.ok).toBe(true);
    if (byTask.ok) {
      expect(byTask.value).toHaveLength(1);
      expect(byTask.value[0]?.title).toBe('广交会翻译兼职');
      expect(byTask.value[0]?.taskIds).toEqual(['task-1']);
    }

    const otherTask = await repo.listByTaskId('task-2');
    if (otherTask.ok) expect(otherTask.value).toHaveLength(0);
  });

  it('重复读取不产生重复行（第二次全部是 duplicates）', async () => {
    const repo = new NoteRepository();
    await saveNoteDrafts(repo, [draft()], ctx('task-1'), parseTime);
    const second = await saveNoteDrafts(repo, [draft()], ctx('task-1'), parseTime);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.processed.added).toBe(0);
    expect(second.value.processed.duplicates).toBe(1);

    const all = await repo.getAll();
    if (all.ok) expect(all.value).toHaveLength(1);
  });

  it('落库时保存 openUrl（带 xsec_token），重新读取会覆盖为最新 token', async () => {
    const repo = new NoteRepository();
    const first = draft({
      openUrl: 'https://www.xiaohongshu.com/explore/65f1a2b3c4d5e6f708192a3b?xsec_token=OLD',
    });
    await saveNoteDrafts(repo, [first], ctx('task-1'), parseTime);

    let all = await repo.getAll();
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    expect(all.value[0]?.openUrl).toContain('xsec_token=OLD');
    // 去重链接始终不带 token
    expect(all.value[0]?.canonicalUrl).not.toContain('xsec_token');

    const second = draft({
      openUrl: 'https://www.xiaohongshu.com/explore/65f1a2b3c4d5e6f708192a3b?xsec_token=NEW',
    });
    await saveNoteDrafts(repo, [second], ctx('task-1'), parseTime);

    all = await repo.getAll();
    if (all.ok) {
      expect(all.value).toHaveLength(1);
      expect(all.value[0]?.openUrl).toContain('xsec_token=NEW');
      expect(all.value[0]?.openUrl).not.toContain('OLD');
    }
  });

  it('同一笔记被不同任务发现：一条记录 + taskIds 追加', async () => {
    const repo = new NoteRepository();
    await saveNoteDrafts(repo, [draft()], ctx('task-1'), parseTime);
    await saveNoteDrafts(repo, [draft()], ctx('task-2'), parseTime);

    const all = await repo.getAll();
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    expect(all.value).toHaveLength(1);
    expect(all.value[0]?.taskIds).toEqual(['task-1', 'task-2']);

    const byTask2 = await repo.listByTaskId('task-2');
    if (byTask2.ok) expect(byTask2.value).toHaveLength(1);
  });

  it('同 id 再次读取时标题更新为新值，旧值不残留', async () => {
    const repo = new NoteRepository();
    await saveNoteDrafts(repo, [draft({ title: '旧标题' })], ctx(), parseTime);
    await saveNoteDrafts(repo, [draft({ title: '新标题' })], ctx(), parseTime);

    const all = await repo.getAll();
    if (all.ok) {
      expect(all.value).toHaveLength(1);
      expect(all.value[0]?.title).toBe('新标题');
    }
  });

  it('发布时间由 parseXhsTime 填充，原文同时保留', async () => {
    const repo = new NoteRepository();
    const before = Date.now();
    await saveNoteDrafts(repo, [draft({ timeText: '3 天前' })], ctx(), parseTime);
    const all = await repo.getAll();
    if (!all.ok) return;
    const note = all.value[0];
    expect(note?.publishedAtRaw).toBe('3 天前');
    expect(note?.publishedAt).not.toBeNull();
    const published = Date.parse(note?.publishedAt ?? '');
    // 3 天前 ≈ before - 3 天（允许几秒误差）
    expect(Math.abs(published - (before - 3 * 24 * 3600 * 1000))).toBeLessThan(60_000);
  });

  it('无链接的卡片走指纹兜底，仍能落库并按指纹去重', async () => {
    const repo = new NoteRepository();
    const noLink = draft({ noteId: null, url: null, canonicalUrl: null, title: '只有标题的卡片' });
    await saveNoteDrafts(repo, [noLink], ctx(), parseTime);
    await saveNoteDrafts(repo, [noLink], ctx(), parseTime);

    const all = await repo.getAll();
    if (all.ok) {
      expect(all.value).toHaveLength(1);
      expect(all.value[0]?.dedupeKeyType).toBe('fingerprint');
      expect(all.value[0]?.dedupeKey.startsWith('fp:')).toBe(true);
    }
  });

  it('未选择任务时笔记仍落库，只是不关联任务', async () => {
    const repo = new NoteRepository();
    await saveNoteDrafts(repo, [draft()], ctx(null), parseTime);
    const all = await repo.getAll();
    if (all.ok) {
      expect(all.value).toHaveLength(1);
      expect(all.value[0]?.taskIds).toEqual([]);
    }
  });
});

describe('T3.5/T3.6 查询与状态', () => {
  it('listNotes 按任务 + 状态 + 关键词组合过滤', async () => {
    const repo = new NoteRepository();
    await saveNoteDrafts(
      repo,
      [
        draft({ noteId: 'aaaaaaaaaaaaaaaaaaaaaaaa', title: '广交会翻译' }),
        draft({ noteId: 'bbbbbbbbbbbbbbbbbbbbbbbb', title: 'Canton Fair 陪同' }),
      ],
      ctx('task-1'),
      parseTime,
    );

    const all = await listNotes(repo, { taskId: 'task-1' });
    if (all.ok) expect(all.value).toHaveLength(2);

    const byKeyword = await listNotes(repo, { taskId: 'task-1', keyword: 'canton' });
    if (byKeyword.ok) {
      expect(byKeyword.value).toHaveLength(1);
      expect(byKeyword.value[0]?.title).toContain('Canton Fair');
    }

    const byStatus = await listNotes(repo, { taskId: 'task-1', status: NoteStatus.REVIEWED });
    if (byStatus.ok) expect(byStatus.value).toHaveLength(0);
  });

  it('状态更新落库并写入活动记录', async () => {
    const repo = new NoteRepository();
    const activityRepo = new ActivityRepository();
    await saveNoteDrafts(repo, [draft()], ctx('task-1'), parseTime);
    const all = await repo.getAll();
    if (!all.ok) return;
    const id = all.value[0]?.id as string;

    const updated = await setNoteStatus(repo, activityRepo, id, NoteStatus.REVIEWED, 'task-1');
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.value.status).toBe(NoteStatus.REVIEWED);

    const readBack = await repo.getById(id);
    if (readBack.ok) expect(readBack.value?.status).toBe(NoteStatus.REVIEWED);

    const activities = await activityRepo.getAll();
    if (activities.ok) {
      expect(activities.value).toHaveLength(1);
      expect(activities.value[0]?.action).toBe('MARK_REVIEWED');
      expect(activities.value[0]?.noteId).toBe(id);
    }
  });

  it('非法状态转移被拒绝且不写库', async () => {
    const repo = new NoteRepository();
    const activityRepo = new ActivityRepository();
    await saveNoteDrafts(repo, [draft()], ctx(), parseTime);
    const all = await repo.getAll();
    if (!all.ok) return;
    const id = all.value[0]?.id as string;

    const rejected = await setNoteStatus(repo, activityRepo, id, NoteStatus.CONTACTED);
    expect(rejected.ok).toBe(false);

    const readBack = await repo.getById(id);
    if (readBack.ok) expect(readBack.value?.status).toBe(NoteStatus.NEW);

    const activities = await activityRepo.getAll();
    if (activities.ok) expect(activities.value).toHaveLength(0);
  });
});
