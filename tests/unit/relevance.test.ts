import { describe, expect, it } from 'vitest';
import { calculateRelevance } from '../../src/shared/domain/relevance';
import { NoteStatus } from '../../src/shared/types/note';
import { TaskCategory } from '../../src/shared/types/task';
import type { Note } from '../../src/shared/types/note';
import type { Task } from '../../src/shared/types/task';

const note: Note = {
  id: 'n1', canonicalUrl: 'https://www.xiaohongshu.com/explore/65f1a2b3c4d5e6f708192a3b', dedupeKey: 'url:x', dedupeKeyType: 'url',
  title: '广交会英语翻译机会', contentSnippet: '展位现场需要 interpreter', publishedAt: '2026-03-05T00:00:00.000Z', publishedAtRaw: '2026-03-05', authorDisplayName: 'a', relevance: { taskId: '', score: 0, level: 'low', matchedKeywords: [], reasons: [], evaluatedAt: '' }, relevanceByTask: {}, sourcePageUrl: 'www.xiaohongshu.com/search_result', extractedAt: '2026-03-05T00:00:00.000Z', extractionVersion: 'xhs-1.0.0', extractionQuality: 'complete', taskIds: ['t1'], status: NoteStatus.NEW, userNotes: '', createdAt: '2026-03-05T00:00:00.000Z', updatedAt: '2026-03-05T00:00:00.000Z',
};
const task: Task = {
  id: 't1', name: '翻译', keywords: ['广交会', 'interpreter'], language: 'mixed', category: TaskCategory.INTERPRETER,
  dateRange: { from: '2026-03-01', to: '2026-03-10' }, copyIds: [], status: 'ACTIVE', notes: '', createdAt: '', updatedAt: '',
  relevanceConfig: { titleWeight: 3, snippetWeight: 1, categoryBonus: 10, timeInRangeBonus: 5, timeOutOfRangePenalty: -10, negativeKeywordPenalty: -15, negativeKeywords: ['招聘'], highThreshold: 50, mediumThreshold: 27 },
};

/** 不命中任何关键词、不做时间判断的基准任务，用于隔离单条规则 */
const neutralTask: Task = {
  ...task,
  keywords: [],
  category: TaskCategory.OTHER,
  dateRange: { from: null, to: null },
};

describe('阶段 4 相关性评分', () => {
  it('按标题、摘要、类别和时间范围累计分数并保留解释', () => {
    const result = calculateRelevance(note, task, '2026-03-10T00:00:00.000Z');
    expect(result.score).toBeGreaterThanOrEqual(27);
    expect(result.level).toBe('high');
    expect(result.matchedKeywords).toEqual(['广交会', 'interpreter']);
    expect(result.reasons.map((reason) => reason.rule)).toEqual(expect.arrayContaining(['title-keyword', 'snippet-keyword', 'category-match', 'time-in-range']));
  });

  it('负向关键词扣分，分数被限制在 0 到 100', () => {
    const result = calculateRelevance({ ...note, title: '招聘信息', contentSnippet: '招聘' }, task);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.reasons.some((reason) => reason.rule === 'negative-keyword')).toBe(true);
  });

  it('无发布时间时不添加时间规则', () => {
    const result = calculateRelevance({ ...note, publishedAt: null }, task);
    expect(result.reasons.some((reason) => reason.rule.startsWith('time-'))).toBe(false);
  });

  it('类别场景词单独命中时记 category-match 并加分（docs/11 §6 自动化清单要求）', () => {
    // 任务关键词完全不命中，只有类别预设词「英语翻译」命中
    const result = calculateRelevance(
      { ...note, title: '求英语翻译一名，广交会期间', contentSnippet: null },
      { ...neutralTask, keywords: ['完全无关的词'], category: TaskCategory.INTERPRETER },
    );
    expect(result.matchedKeywords).toEqual([]);
    expect(result.reasons.map((r) => r.rule)).toEqual(['category-match']);
    expect(result.score).toBe(task.relevanceConfig.categoryBonus);
  });

  it('类别为 OTHER 时没有预设场景词，不产生 category-match', () => {
    const result = calculateRelevance({ ...note, title: '求英语翻译一名' }, neutralTask);
    expect(result.reasons.some((reason) => reason.rule === 'category-match')).toBe(false);
    expect(result.score).toBe(0);
  });

  it('发布时间在目标范围外时记 time-out-of-range 并扣分', () => {
    const result = calculateRelevance(
      { ...note, publishedAt: '2026-05-01T00:00:00.000Z' },
      { ...neutralTask, dateRange: { from: '2026-03-01', to: '2026-03-10' } },
    );
    expect(result.reasons.map((r) => r.rule)).toContain('time-out-of-range');
    expect(result.reasons.find((r) => r.rule === 'time-out-of-range')?.scoreDelta).toBe(-10);
    expect(result.score).toBe(0); // -10 被 0–100 下限截断
  });

  it('时间范围只给边界一端时仍能判定在范围内', () => {
    const onlyFrom = calculateRelevance(
      { ...note, publishedAt: '2026-03-05T00:00:00.000Z' },
      { ...neutralTask, dateRange: { from: '2026-03-01', to: null } },
    );
    expect(onlyFrom.reasons.map((r) => r.rule)).toContain('time-in-range');

    const onlyTo = calculateRelevance(
      { ...note, publishedAt: '2026-03-05T00:00:00.000Z' },
      { ...neutralTask, dateRange: { from: null, to: '2026-03-10' } },
    );
    expect(onlyTo.reasons.map((r) => r.rule)).toContain('time-in-range');
  });

  it('任务没有设置时间范围时，即使笔记有时间也不做时间判断', () => {
    const result = calculateRelevance(note, neutralTask);
    expect(result.reasons.some((reason) => reason.rule.startsWith('time-'))).toBe(false);
  });

  it('分数上限为 100，且等级按阈值划分', () => {
    const heavy: Task = { ...task, keywords: Array.from({ length: 20 }, (_, i) => `关键词${i}`) };
    const crowded: Note = { ...note, title: heavy.keywords.join(' ') };
    const high = calculateRelevance(crowded, heavy);
    expect(high.score).toBe(100);
    expect(high.level).toBe('high');

    const low = calculateRelevance({ ...note, title: '无关', contentSnippet: null }, neutralTask);
    expect(low.score).toBe(0);
    expect(low.level).toBe('low');
  });

  it('同一笔记在不同任务下评分互不影响（relevanceByTask 隔离由服务层保证）', () => {
    const a = calculateRelevance(note, task);
    const b = calculateRelevance(note, { ...neutralTask, id: 't2' });
    expect(a.taskId).toBe('t1');
    expect(b.taskId).toBe('t2');
    expect(a.score).toBeGreaterThan(b.score);
  });
});
