// 小红书页面适配器（阶段 3：正式笔记提取）
//
// 职责边界（阶段 3 §3）：
//   - 只读 DOM，不滚动、不翻页、不请求接口、不写页面；
//   - 所有选择器都来自 ./selectors.ts（唯一允许出现选择器的地方）；
//   - 每张卡片只从「自身节点」取字段，绝不跨节点拼接（虚拟滚动/DOM 复用风险）；
//   - 提取失败绝不静默：返回带 skipReasons 的 ExtractionOutcome，由诊断层转成错误码。
//
// 本文件是全仓库唯一读取 DOM 内容的入口（红线核查项：extractVisibleNotes 之外无 DOM 读取）。

import type { ExtractionValidation, PageAdapter } from './page-adapter';
import {
  MAX_CARDS_PER_SCAN,
  MAX_SNIPPET_LENGTH,
  MAX_TITLE_LENGTH,
  TITLE_RULE,
  AUTHOR_RULE,
  TIME_RULE,
  SNIPPET_RULE,
  collectNoteCards,
  collectSignals,
  findNoteLink,
  queryFirstWithText,
  toAbsoluteUrl,
} from './selectors';
import { buildDiagnostics } from '../diagnostics';
import {
  buildNoteOpenUrl,
  canonicalizeNoteUrl,
  extractNoteId,
  parsePageUrl,
} from '../../shared/domain/normalization';
import { normalizeText, truncateText } from '../../shared/utils/text';
import { nowIso } from '../../shared/utils/time';
import type {
  ExtractionDiagnostics,
  ExtractionOutcome,
  NoteDraft,
  PageType,
  SkipReason,
} from '../../shared/types/extraction';

/** 页面类型白名单（docs/verification-results.md §7 第 5 项：改显式白名单） */
const SEARCH_PATHS = ['/search_result', '/search_result_ai', '/search'];
const PROFILE_PATHS = ['/user/profile'];

export function createXiaohongshuAdapter(pageUrl: string, doc: Document): PageAdapter {
  const parsed = parsePageUrl(pageUrl);
  const supported = parsed?.isXiaohongshu ?? false;
  const host = parsed?.host ?? null;
  const pageType = classifyPageType(parsed?.pathname ?? '');

  // 一次读取只扫描一遍 DOM：提取与诊断共用同一份结果，
  // 避免「诊断说 20 条、列表却 18 条」的不一致。
  let cached: ExtractionOutcome | null = null;
  // 扫描耗时必须在**扫描前后**各取一次；若在 buildDiagnostics 里取，durationMs 恒为 0。
  let scanStartedAt: string | null = null;
  let scanFinishedAt: string | null = null;
  const outcome = (): ExtractionOutcome => {
    if (!cached) {
      scanStartedAt = nowIso();
      cached =
        supported && pageType === 'search_results'
          ? extractNotesFromDocument(doc)
          : { drafts: [], totalCandidates: 0, skipped: 0, skipReasons: {}, truncated: false };
      scanFinishedAt = nowIso();
    }
    return cached;
  };

  return {
    isSupportedPage: () => supported,
    getPageType: () => (supported ? pageType : 'other'),

    extractVisibleNotes: (): NoteDraft[] => outcome().drafts,

    normalizeNote: (draft: NoteDraft): NoteDraft => normalizeDraft(draft),

    getExtractionDiagnostics: (): ExtractionDiagnostics => {
      const result = outcome();
      const signals = collectSignals(doc);
      return buildDiagnostics({
        pageUrl,
        supported,
        host,
        pageType,
        signals,
        candidates: result.totalCandidates,
        extraction: result,
        scanStartedAt,
        scanFinishedAt,
      });
    },

    validateExtractionResult: (drafts: NoteDraft[]): ExtractionValidation => {
      if (drafts.length === 0) {
        return { valid: false, problems: ['未提取到任何笔记'] };
      }
      const problems: string[] = [];
      const noTitle = drafts.filter((d) => !d.title).length;
      const noId = drafts.filter((d) => !d.noteId).length;
      if (noTitle > 0) problems.push(`${noTitle} 条缺少标题`);
      if (noId > 0) problems.push(`${noId} 条缺少可解析的笔记链接（将使用指纹去重）`);
      return { valid: problems.length === 0, problems };
    },
  };
}

/** 供适配器与测试直接调用：从文档提取全部可见笔记草稿 */
export function extractNotesFromDocument(doc: Document): ExtractionOutcome {
  const cards = collectNoteCards(doc);
  const truncated = cards.length > MAX_CARDS_PER_SCAN;
  const target = truncated ? cards.slice(0, MAX_CARDS_PER_SCAN) : cards;

  const drafts: NoteDraft[] = [];
  const skipReasons: Partial<Record<SkipReason, number>> = {};
  let skipped = 0;
  const skip = (reason: SkipReason): void => {
    skipped += 1;
    skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
  };

  for (const card of target) {
    const draft = extractCard(card);
    if (draft) {
      drafts.push(draft);
    } else {
      skip('no-identifiable-content');
    }
  }

  if (truncated) {
    const overflow = cards.length - MAX_CARDS_PER_SCAN;
    skipped += overflow;
    skipReasons['scan-limit'] = (skipReasons['scan-limit'] ?? 0) + overflow;
  }

  return {
    drafts,
    totalCandidates: cards.length,
    skipped,
    skipReasons,
    truncated,
  };
}

/**
 * 提取单张卡片。
 * 返回 null 表示这张卡片没有任何可识别内容（懒加载占位/骨架屏），计入 skipped。
 */
function extractCard(card: Element): NoteDraft | null {
  const anchor = findNoteLink(card, extractNoteId);
  const rawHref = anchor?.getAttribute('href') ?? null;
  const url = rawHref ? toAbsoluteUrl(rawHref) : null;
  const noteId = url ? extractNoteId(url) : null;
  const canonicalUrl = url ? canonicalizeNoteUrl(url) : null;
  // 打开链接保留 xsec_token 等授权参数：丢掉它会让新标签页跳到扫码登录
  const openUrl = url ? buildNoteOpenUrl(url) : null;

  const titleText = pickTitle(card, anchor);
  const author = queryFirstWithText(card, AUTHOR_RULE.selectors)?.text ?? null;
  const timeText = queryFirstWithText(card, TIME_RULE.selectors)?.text ?? null;
  const snippetText = queryFirstWithText(card, SNIPPET_RULE.selectors)?.text ?? null;

  // 既无链接也无标题 → 占位卡片，不生成草稿（绝不伪造数据）
  if (!url && !titleText) return null;

  const title = titleText ? truncateText(titleText, MAX_TITLE_LENGTH) : null;
  const snippet = snippetText ? truncateText(snippetText, MAX_SNIPPET_LENGTH) : null;

  const missingFields: NoteDraft['missingFields'] = [];
  if (!noteId) missingFields.push('url');
  if (!title) missingFields.push('title');
  if (!timeText) missingFields.push('publishedAt');

  return {
    url,
    canonicalUrl,
    openUrl,
    noteId,
    title,
    snippet,
    timeText,
    publishedAtRaw: timeText,
    authorDisplayName: author ? normalizeText(author) : null,
    quality: missingFields.length === 0 ? 'complete' : 'partial',
    missingFields,
  };
}

/** 标题优先级：卡片内标题节点 → 链接 title/aria-label → 封面图 alt */
function pickTitle(card: Element, anchor: HTMLAnchorElement | null): string | null {
  const fromNode = queryFirstWithText(card, TITLE_RULE.selectors)?.text ?? null;
  if (fromNode && fromNode.length > 0) return fromNode;

  const attrTitle = normalizeText(anchor?.getAttribute('title') ?? '');
  if (attrTitle.length > 0) return attrTitle;

  const ariaLabel = normalizeText(anchor?.getAttribute('aria-label') ?? '');
  if (ariaLabel.length > 0) return ariaLabel;

  const alt = normalizeText(card.querySelector('img[alt]')?.getAttribute('alt') ?? '');
  if (alt.length > 0) return alt;

  return null;
}

/** 规范化草稿：只做文本层面处理，不补造任何字段 */
export function normalizeDraft(draft: NoteDraft): NoteDraft {
  const title = draft.title ? truncateText(draft.title, MAX_TITLE_LENGTH) : null;
  const snippet = draft.snippet ? truncateText(draft.snippet, MAX_SNIPPET_LENGTH) : null;
  const canonicalUrl = draft.canonicalUrl ?? canonicalizeNoteUrl(draft.url);
  const openUrl = draft.openUrl ?? (draft.url ? buildNoteOpenUrl(draft.url) : null);
  const noteId = draft.noteId ?? (draft.url ? extractNoteId(draft.url) : null);
  const missingFields = draft.missingFields.filter((field) => {
    if (field === 'url') return !noteId;
    if (field === 'title') return !title;
    if (field === 'publishedAt') return !draft.timeText;
    if (field === 'snippet') return !snippet;
    return false;
  });
  return {
    ...draft,
    title,
    snippet,
    canonicalUrl,
    openUrl,
    noteId,
    quality: missingFields.length === 0 ? 'complete' : 'partial',
    missingFields,
  };
}

/** 页面类型分类：显式白名单前缀匹配（实测 `/search_result_ai` 也覆盖） */
export function classifyPageType(pathname: string): PageType {
  if (SEARCH_PATHS.some((prefix) => pathname.startsWith(prefix))) return 'search_results';
  // 详情页 URL 形如 /explore/<id> 或 /discovery/item/<id>（id 非空即可，不限定字符集）
  if (/^\/(explore|discovery\/item)\/[^/]+\/?$/i.test(pathname)) return 'note_detail';
  if (PROFILE_PATHS.some((prefix) => pathname.startsWith(prefix))) return 'profile';
  return 'other';
}
