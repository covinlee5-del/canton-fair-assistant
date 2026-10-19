// 笔记服务（阶段 3 T3.4 去重与合并 + T3.5 落库与任务关联 + T3.6 查询/状态）
//
// 设计约束：
//   - 主键语义用 dedupeKey（url:{noteId} 或 fp:{指纹}），绝不用 DOM 位置（卡片会复用/重排）；
//   - 同一条笔记被多次读取：更新字段、追加 taskIds，不新增行；
//   - 同一笔记被不同任务发现：保留一条全局记录 + taskIds 数组（docs/03 §10 第 4 条）；
//   - 状态变更按 docs/03 状态机校验，非法转移拒绝并返回 INVALID_INPUT。

import { createId } from '../shared/utils/ids';
import { nowIso } from '../shared/utils/time';
import { normalizeText } from '../shared/utils/text';
import { appError, appErrorWithMessage, fail, ok } from '../shared/utils/result';
import { ErrorCode } from '../shared/types/base';
import { NoteStatus } from '../shared/types/note';
import { NOTE_STATUS_LABELS } from '../shared/constants/statuses';
import { ActivityAction } from '../shared/types/activity';
import { computeDedupeKey } from '../shared/domain/normalization';
import { SELECTOR_VERSION } from '../content/adapters/selectors';
import type { ID, Result } from '../shared/types/base';
import type { Note, RelevanceResult } from '../shared/types/note';
import type { NoteDraft, ReadPageProcessed } from '../shared/types/extraction';
import type { OutreachActivity } from '../shared/types/activity';
import type { Repository } from '../data/repository';
import type { NoteRepository } from '../data/note-repository';

/** 阶段 3 尚未做相关性评分（阶段 4）：占位结果，score=0 且无理由，UI 显示“未评分” */
export function createPlaceholderRelevance(taskId: ID | null): RelevanceResult {
  return {
    taskId: taskId ?? '',
    score: 0,
    level: 'low',
    matchedKeywords: [],
    reasons: [],
    evaluatedAt: nowIso(),
  };
}

/** 是否已经真正评过分（阶段 4 起才可能为 true） */
export function hasRelevanceScore(note: Note): boolean {
  return note.relevance.reasons.length > 0;
}

/** 空值判断：null / undefined / 仅空白 都算空 */
function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0;
}

/**
 * 合并两条草稿：`next` 视为更新的读取结果，非空字段优先；
 * `prev` 只用来填补 `next` 的空字段（阶段 3 T3.4「保留最新、合并空字段」）。
 */
export function mergeDraft(prev: NoteDraft, next: NoteDraft): NoteDraft {
  const pick = (a: string | null, b: string | null): string | null =>
    !isBlank(a) ? a : !isBlank(b) ? b : null;

  const merged: NoteDraft = {
    url: pick(next.url, prev.url),
    canonicalUrl: pick(next.canonicalUrl, prev.canonicalUrl),
    openUrl: pick(next.openUrl, prev.openUrl),
    noteId: pick(next.noteId, prev.noteId),
    title: pick(next.title, prev.title),
    snippet: pick(next.snippet, prev.snippet),
    timeText: pick(next.timeText, prev.timeText),
    publishedAtRaw: pick(next.publishedAtRaw, prev.publishedAtRaw),
    authorDisplayName: pick(next.authorDisplayName, prev.authorDisplayName),
    quality: 'complete',
    missingFields: [],
  };
  return recomputeDraftQuality(merged);
}

/** 依据字段实际内容重算 quality / missingFields（不补造数据） */
export function recomputeDraftQuality(draft: NoteDraft): NoteDraft {
  const missingFields: NoteDraft['missingFields'] = [];
  if (!draft.noteId) missingFields.push('url');
  if (isBlank(draft.title)) missingFields.push('title');
  if (isBlank(draft.timeText)) missingFields.push('publishedAt');
  return {
    ...draft,
    quality: missingFields.length === 0 ? 'complete' : 'partial',
    missingFields,
  };
}

/**
 * 单批草稿内部去重（T3.4）：
 * - 按 dedupeKey 归并，保留首次出现的位置（列表顺序与页面一致）；
 * - 同一 key 的后续出现视为更新，非空字段覆盖旧值；
 * - 无任何标识（无链接也无标题）的草稿直接丢弃（适配器已计入 skipped）。
 */
export function mergeNoteDrafts(drafts: NoteDraft[]): NoteDraft[] {
  const order: string[] = [];
  const merged = new Map<string, NoteDraft>();

  for (const draft of drafts) {
    const keyResult = computeDedupeKey(draft);
    if (!keyResult) continue;
    const existing = merged.get(keyResult.key);
    if (!existing) {
      order.push(keyResult.key);
      merged.set(keyResult.key, recomputeDraftQuality(draft));
      continue;
    }
    merged.set(keyResult.key, mergeDraft(existing, draft));
  }

  return order
    .map((key) => merged.get(key))
    .filter((draft): draft is NoteDraft => draft != null);
}

export interface SaveNotesContext {
  /** 当前任务（可为 null：笔记仍会入库，只是暂不关联任务） */
  taskId: ID | null;
  /** 来源页面（仅 origin + pathname） */
  sourcePageUrl: string;
  /** 提取器版本，默认取当前选择器版本 */
  extractionVersion?: string;
  /** 读取时刻，便于测试注入 */
  now?: string;
}

export interface SaveNotesOutcome {
  notes: Note[];
  processed: ReadPageProcessed;
}

/** 把草稿转成待写入的 Note（新建） */
export function buildNote(draft: NoteDraft, ctx: SaveNotesContext): Note | null {
  const keyResult = computeDedupeKey(draft);
  if (!keyResult) return null;
  const now = ctx.now ?? nowIso();
  return {
    id: createId(),
    canonicalUrl:
      draft.canonicalUrl ??
      (draft.noteId ? `https://www.xiaohongshu.com/explore/${draft.noteId}` : ''),
    openUrl: draft.openUrl ?? null,
    dedupeKey: keyResult.key,
    dedupeKeyType: keyResult.type,
    title: draft.title ?? '',
    contentSnippet: draft.snippet,
    publishedAt: null, // 由 parseNoteTime 在写入前填充
    publishedAtRaw: draft.publishedAtRaw ?? draft.timeText,
    authorDisplayName: draft.authorDisplayName,
    relevance: createPlaceholderRelevance(ctx.taskId),
    relevanceByTask: {},
    sourcePageUrl: ctx.sourcePageUrl,
    extractedAt: now,
    extractionVersion: ctx.extractionVersion ?? SELECTOR_VERSION,
    extractionQuality: draft.quality,
    taskIds: ctx.taskId ? [ctx.taskId] : [],
    status: NoteStatus.NEW,
    userNotes: '',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 把一批草稿写入仓储（T3.5）：
 * - 先做批内去重；
 * - 再按 dedupeKey 查已有记录：有则更新（追加 taskIds、补空字段），无则新建；
 * - 返回本次涉及的笔记与 processed 统计（added / duplicates / failed）。
 */
export async function saveNoteDrafts(
  repo: NoteRepository,
  drafts: NoteDraft[],
  ctx: SaveNotesContext,
  parseTime: (raw: string | null) => string | null,
): Promise<Result<SaveNotesOutcome>> {
  const merged = mergeNoteDrafts(drafts);
  const failureReasons: string[] = [];
  let added = 0;
  let duplicates = 0;
  let failed = 0;
  const touched: Note[] = [];

  for (const draft of merged) {
    const keyResult = computeDedupeKey(draft);
    if (!keyResult) {
      failed += 1;
      failureReasons.push('缺少可用的笔记标识（无链接也无标题）');
      continue;
    }

    const existing = await repo.getByDedupeKey(keyResult.key);
    if (!existing.ok) return existing;
    const now = ctx.now ?? nowIso();
    const publishedAt = parseTime(draft.timeText);

    if (existing.value) {
      const prev = existing.value;
      const next: Note = {
        ...prev,
        // 非空新值优先，空值不覆盖已有内容
        canonicalUrl: !isBlank(draft.canonicalUrl) ? (draft.canonicalUrl as string) : prev.canonicalUrl,
        // 重新读取会拿到新签发的 xsec_token，因此非空 openUrl 总是覆盖旧值
        openUrl: !isBlank(draft.openUrl) ? draft.openUrl : (prev.openUrl ?? null),
        title: !isBlank(draft.title) ? (draft.title as string) : prev.title,
        contentSnippet: !isBlank(draft.snippet) ? draft.snippet : prev.contentSnippet,
        publishedAt: publishedAt ?? prev.publishedAt,
        publishedAtRaw: !isBlank(draft.publishedAtRaw) ? draft.publishedAtRaw : prev.publishedAtRaw,
        authorDisplayName: !isBlank(draft.authorDisplayName)
          ? draft.authorDisplayName
          : prev.authorDisplayName,
        sourcePageUrl: ctx.sourcePageUrl || prev.sourcePageUrl,
        extractedAt: now,
        extractionVersion: ctx.extractionVersion ?? SELECTOR_VERSION,
        extractionQuality: draft.quality,
        taskIds: appendTaskId(prev.taskIds, ctx.taskId),
        updatedAt: now,
      };
      const saved = await repo.upsert(next);
      if (!saved.ok) return saved;
      duplicates += 1;
      touched.push(next);
      continue;
    }

    const note = buildNote(draft, ctx);
    if (!note) {
      failed += 1;
      failureReasons.push('缺少可用的笔记标识（无链接也无标题）');
      continue;
    }
    note.publishedAt = publishedAt;
    const saved = await repo.upsert(note);
    if (!saved.ok) return saved;
    added += 1;
    touched.push(note);
  }

  return ok({
    notes: touched,
    processed: {
      total: merged.length,
      added,
      duplicates,
      failed,
      failureReasons,
    },
  });
}

/** 追加任务关联（已存在则不重复追加） */
export function appendTaskId(taskIds: ID[], taskId: ID | null): ID[] {
  if (!taskId) return [...taskIds];
  if (taskIds.includes(taskId)) return [...taskIds];
  return [...taskIds, taskId];
}

export interface NoteFilter {
  taskId?: ID | null;
  status?: NoteStatus | null;
  /** 标题/作者/摘要的本地包含匹配（不做网络搜索） */
  keyword?: string | null;
  sortBy?: 'relevance' | 'publishedAt' | 'updatedAt' | 'status';
  sortOrder?: 'asc' | 'desc';
  minScore?: number | null;
}

/** 列表查询（T3.6 notes.list）：默认按发布时间倒序，无发布时间按读取时间倒序 */
export async function listNotes(
  repo: NoteRepository,
  filter: NoteFilter = {},
): Promise<Result<Note[]>> {
  const base = filter.taskId ? await repo.listByTaskId(filter.taskId) : await repo.getAll();
  if (!base.ok) return base;

  let notes = base.value;
  const score = (note: Note): number => filter.taskId
    ? note.relevanceByTask[filter.taskId]?.score ?? 0
    : note.relevance.score;
  if (filter.status) notes = notes.filter((n) => n.status === filter.status);
  const keyword = normalizeText(filter.keyword ?? '').toLocaleLowerCase();
  if (keyword.length > 0) {
    notes = notes.filter((n) => {
      const haystack = `${n.title} ${n.authorDisplayName ?? ''} ${n.contentSnippet ?? ''}`.toLocaleLowerCase();
      return haystack.includes(keyword);
    });
  }

  if (filter.minScore != null) notes = notes.filter((n) => score(n) >= filter.minScore!);

  if (filter.taskId) {
    notes = notes.map((note) => ({
      ...note,
      relevance: note.relevanceByTask[filter.taskId!] ?? note.relevance,
    }));
  }

  return ok(
    notes.sort((a, b) => {
      const direction = filter.sortOrder === 'asc' ? 1 : -1;
      if (filter.sortBy === 'relevance') return (score(a) - score(b)) * direction;
      if (filter.sortBy === 'status') return a.status.localeCompare(b.status) * direction;
      if (filter.sortBy === 'updatedAt') return a.updatedAt.localeCompare(b.updatedAt) * direction;
      const aTime = a.publishedAt ?? a.extractedAt;
      const bTime = b.publishedAt ?? b.extractedAt;
      return bTime.localeCompare(aTime) * (filter.sortOrder === 'asc' ? -1 : 1);
    }),
  );
}

export async function bulkSetNoteStatus(
  noteRepo: NoteRepository,
  activityRepo: Repository<OutreachActivity>,
  ids: ID[],
  status: NoteStatus,
  taskId: ID | null = null,
): Promise<Result<Note[]>> {
  const uniqueIds = [...new Set(ids)];
  const found: Note[] = [];
  const blocked: Note[] = [];
  for (const id of uniqueIds) {
    const item = await noteRepo.getById(id);
    if (!item.ok) return item;
    // 找不到记录也视为不可变更，避免「批量里混进已删除笔记」时静默跳过
    if (!item.value || !canTransition(item.value.status, status)) {
      if (item.value) blocked.push(item.value);
      continue;
    }
    found.push(item.value);
  }
  // 「全有或全无」：只要有一条不能变，整批都不执行，绝不部分更新
  if (blocked.length > 0) {
    const sample = blocked
      .slice(0, 3)
      .map((note) => `「${note.title || '（无标题）'}」当前为${NOTE_STATUS_LABELS[note.status]}`)
      .join('、');
    return fail(
      appErrorWithMessage(
        ErrorCode.INVALID_INPUT,
        `整批未执行：有 ${blocked.length} 条笔记当前状态不允许变更为「${NOTE_STATUS_LABELS[status]}」` +
          `（${sample}${blocked.length > 3 ? ' 等' : ''}）。请先取消勾选这些笔记。`,
        `ids=${uniqueIds.join(',')}; target=${status}; blocked=${blocked.map((n) => n.id).join(',')}`,
      ),
    );
  }
  const updated: Note[] = [];
  for (const note of found) {
    const result = await setNoteStatus(noteRepo, activityRepo, note.id, status, taskId);
    if (!result.ok) return result;
    updated.push(result.value);
  }
  return ok(updated);
}

/** 状态机（docs/03 §4）：非法转移一律拒绝 */
const ALLOWED_TRANSITIONS: Record<NoteStatus, NoteStatus[]> = {
  [NoteStatus.NEW]: [NoteStatus.REVIEWED, NoteStatus.IRRELEVANT],
  [NoteStatus.REVIEWED]: [
    NoteStatus.MARKED_FOR_CONTACT,
    NoteStatus.PROMOTED,
    NoteStatus.IRRELEVANT,
  ],
  [NoteStatus.MARKED_FOR_CONTACT]: [NoteStatus.PROMOTED],
  [NoteStatus.PROMOTED]: [NoteStatus.REPLIED, NoteStatus.IRRELEVANT],
  [NoteStatus.REPLIED]: [NoteStatus.CONTACTED, NoteStatus.IRRELEVANT],
  [NoteStatus.CONTACTED]: [],
  [NoteStatus.IRRELEVANT]: [],
};

export function canTransition(from: NoteStatus, to: NoteStatus): boolean {
  if (from === to) return true;
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

const STATUS_TO_ACTION: Record<NoteStatus, ActivityAction> = {
  [NoteStatus.NEW]: ActivityAction.EDIT_NOTE,
  [NoteStatus.REVIEWED]: ActivityAction.MARK_REVIEWED,
  [NoteStatus.MARKED_FOR_CONTACT]: ActivityAction.MARK_FOR_CONTACT,
  [NoteStatus.PROMOTED]: ActivityAction.MARK_PROMOTED,
  [NoteStatus.REPLIED]: ActivityAction.MARK_REPLIED,
  [NoteStatus.CONTACTED]: ActivityAction.MARK_CONTACTED,
  [NoteStatus.IRRELEVANT]: ActivityAction.MARK_IRRELEVANT,
};

const VALID_STATUSES = new Set<string>(Object.values(NoteStatus));

/**
 * 修改笔记状态（T3.6 notes.set-note-status）：
 * 校验状态合法性与状态机，写入笔记并记录一条活动。
 */
export async function setNoteStatus(
  noteRepo: NoteRepository,
  activityRepo: Repository<OutreachActivity>,
  id: ID,
  status: NoteStatus,
  taskId: ID | null = null,
): Promise<Result<Note>> {
  if (!VALID_STATUSES.has(status)) {
    return fail(appError(ErrorCode.INVALID_INPUT, `未知的笔记状态: ${String(status)}`));
  }
  const existing = await noteRepo.getById(id);
  if (!existing.ok) return existing;
  if (!existing.value) {
    return fail(appError(ErrorCode.INVALID_INPUT, '笔记不存在或已被删除'));
  }
  const current = existing.value;
  if (!canTransition(current.status, status)) {
    return fail(
      appError(
        ErrorCode.INVALID_INPUT,
        `不允许的状态变更：${current.status} → ${status}`,
      ),
    );
  }
  const now = nowIso();
  const next: Note = { ...current, status, updatedAt: now };
  const saved = await noteRepo.upsert(next);
  if (!saved.ok) return saved;

  const activity: OutreachActivity = {
    id: createId(),
    noteId: next.id,
    taskId: taskId ?? next.taskIds[0] ?? null,
    action: STATUS_TO_ACTION[status],
    actionAt: now,
  };
  const logged = await activityRepo.create(activity);
  if (!logged.ok) return logged;

  return ok(next);
}
