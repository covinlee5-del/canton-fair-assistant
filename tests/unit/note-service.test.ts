// 去重与合并测试（阶段 3 T3.4）
// 纯函数测试，不依赖 IndexedDB / DOM。

import { describe, expect, it } from 'vitest';
import {
  appendTaskId,
  buildNote,
  canTransition,
  mergeDraft,
  mergeNoteDrafts,
  recomputeDraftQuality,
} from '../../src/services/note-service';
import { computeDedupeKey } from '../../src/shared/domain/normalization';
import { NoteStatus } from '../../src/shared/types/note';
import type { NoteDraft } from '../../src/shared/types/extraction';

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

describe('去重键（docs/03 §10）', () => {
  it('有笔记 ID 时用 url:{id}，且与链接上的查询参数无关', () => {
    const a = computeDedupeKey({ url: 'https://www.xiaohongshu.com/explore/65f1a2b3c4d5e6f708192a3b?xsec_token=X' });
    const b = computeDedupeKey({ url: 'https://www.xiaohongshu.com/explore/65f1a2b3c4d5e6f708192a3b?xsec_token=Y' });
    expect(a?.key).toBe('url:65f1a2b3c4d5e6f708192a3b');
    expect(a?.type).toBe('url');
    expect(a?.key).toBe(b?.key);
  });

  it('无链接时用指纹兜底，标题+作者一致才算同一条', () => {
    const a = computeDedupeKey({ title: '广交会翻译', authorDisplayName: '小鹿' });
    const b = computeDedupeKey({ title: '广交会翻译', authorDisplayName: '小鹿' });
    const c = computeDedupeKey({ title: '广交会翻译', authorDisplayName: '别人' });
    expect(a?.type).toBe('fingerprint');
    expect(a?.key.startsWith('fp:')).toBe(true);
    expect(a?.key).toBe(b?.key);
    expect(a?.key).not.toBe(c?.key);
  });

  it('标题和作者都为空时返回 null（不可识别的卡片不落库）', () => {
    expect(computeDedupeKey({ title: null, authorDisplayName: null })).toBeNull();
    expect(computeDedupeKey({ title: '  ', authorDisplayName: '' })).toBeNull();
  });
});

describe('T3.4 去重与合并', () => {
  it('重复卡片只留一条，且保留首次出现的位置', () => {
    const merged = mergeNoteDrafts([
      draft({ noteId: 'aaaaaaaaaaaaaaaaaaaaaaaa', title: '第一条' }),
      draft({ noteId: 'bbbbbbbbbbbbbbbbbbbbbbbb', title: '第二条' }),
      draft({ noteId: 'aaaaaaaaaaaaaaaaaaaaaaaa', title: '第一条（重复卡片）' }),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.title).toBe('第一条（重复卡片）'); // 最新值覆盖
    expect(merged[1]?.title).toBe('第二条');
  });

  it('两批数据合并不产生重复（先读 + 滚动后再读）', () => {
    const batch1 = mergeNoteDrafts([
      draft({ noteId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }),
      draft({ noteId: 'bbbbbbbbbbbbbbbbbbbbbbbb' }),
    ]);
    const batch2 = mergeNoteDrafts([
      draft({ noteId: 'bbbbbbbbbbbbbbbbbbbbbbbb' }),
      draft({ noteId: 'cccccccccccccccccccccccc' }),
    ]);
    const all = mergeNoteDrafts([...batch1, ...batch2]);
    expect(all).toHaveLength(3);
    expect(new Set(all.map((d) => d.noteId)).size).toBe(3);
  });

  it('同 id 标题更新时取新值（非空新值优先）', () => {
    const merged = mergeDraft(draft({ title: '旧标题' }), draft({ title: '新标题' }));
    expect(merged.title).toBe('新标题');
  });

  it('新读取的空字段不覆盖已有内容，空字段被旧值补齐', () => {
    const merged = mergeDraft(
      draft({ title: '有标题', authorDisplayName: '小鹿', timeText: '3 天前' }),
      draft({ title: null, authorDisplayName: null, timeText: null }),
    );
    expect(merged.title).toBe('有标题');
    expect(merged.authorDisplayName).toBe('小鹿');
    expect(merged.timeText).toBe('3 天前');
    expect(merged.quality).toBe('complete');
  });

  it('缺失字段会重算 quality 与 missingFields', () => {
    const partial = recomputeDraftQuality(draft({ title: null, timeText: null }));
    expect(partial.quality).toBe('partial');
    expect(partial.missingFields).toEqual(['title', 'publishedAt']);
  });

  it('无任何标识的草稿在合并阶段被丢弃', () => {
    const merged = mergeNoteDrafts([
      draft({ noteId: null, url: null, canonicalUrl: null, title: null, authorDisplayName: null }),
      draft({ noteId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }),
    ]);
    expect(merged).toHaveLength(1);
  });
});

describe('任务关联与状态机', () => {
  it('appendTaskId 追加且不重复', () => {
    expect(appendTaskId([], 't1')).toEqual(['t1']);
    expect(appendTaskId(['t1'], 't1')).toEqual(['t1']);
    expect(appendTaskId(['t1'], 't2')).toEqual(['t1', 't2']);
    expect(appendTaskId(['t1'], null)).toEqual(['t1']);
  });

  it('buildNote 生成全局唯一记录并带上任务关联', () => {
    const note = buildNote(draft(), { taskId: 'task-1', sourcePageUrl: 'www.xiaohongshu.com/search_result' });
    expect(note?.dedupeKey).toBe('url:65f1a2b3c4d5e6f708192a3b');
    expect(note?.dedupeKeyType).toBe('url');
    expect(note?.taskIds).toEqual(['task-1']);
    expect(note?.status).toBe(NoteStatus.NEW);
    expect(note?.publishedAt).toBeNull(); // 由 parseXhsTime 在写入前填充
    expect(note?.relevance.reasons).toEqual([]); // 阶段 3 未评分，不伪造分数
  });

  it('状态机允许合法转移、拒绝非法转移', () => {
    expect(canTransition(NoteStatus.NEW, NoteStatus.REVIEWED)).toBe(true);
    expect(canTransition(NoteStatus.NEW, NoteStatus.IRRELEVANT)).toBe(true);
    expect(canTransition(NoteStatus.NEW, NoteStatus.CONTACTED)).toBe(false);
    expect(canTransition(NoteStatus.REVIEWED, NoteStatus.MARKED_FOR_CONTACT)).toBe(true);
    expect(canTransition(NoteStatus.MARKED_FOR_CONTACT, NoteStatus.PROMOTED)).toBe(true);
    expect(canTransition(NoteStatus.PROMOTED, NoteStatus.REPLIED)).toBe(true);
    expect(canTransition(NoteStatus.REPLIED, NoteStatus.CONTACTED)).toBe(true);
    expect(canTransition(NoteStatus.IRRELEVANT, NoteStatus.REVIEWED)).toBe(false);
    expect(canTransition(NoteStatus.REVIEWED, NoteStatus.REVIEWED)).toBe(true); // 幂等
  });
});
