// 诊断信息组装（docs/03 §8、docs/04 §1、阶段 3 T3.8 失效降级）
// 隐私约束：pageUrl 仅 origin+pathname；不含笔记正文、用户信息、Cookie。
//
// 判定顺序（先「用户必须自己处理」的，再「页面没准备好」，最后「结构/内容」）：
//   1. 不支持的站点         → UNSUPPORTED_PAGE
//   2. 验证码/风控          → CAPTCHA_OR_RISK_CONTROL（只提示，绝不绕过）
//   3. 登录墙               → LOGIN_REQUIRED（只提示，绝不绕过）
//   4. 页面未加载完成        → PAGE_NOT_READY
//   5. 卡片在但取不出笔记    → DOM_STRUCTURE_CHANGED（绝不静默返回空列表）
//   6. 完全没有候选          → NO_VISIBLE_NOTES
//   7. 有部分字段缺失        → EXTRACTION_PARTIAL（提示，不阻断）

import { ErrorCode } from '../shared/types/base';
import { messageFor } from '../shared/constants/error-codes';
import { nowIso } from '../shared/utils/time';
import { toPrivacySafePageUrl } from '../shared/domain/normalization';
import { MAX_CARDS_PER_SCAN, SELECTOR_VERSION } from './adapters/selectors';
import type {
  ExtractionDiagnostics,
  ExtractionOutcome,
  PageSignals,
  PageType,
} from '../shared/types/extraction';

export interface DiagnosticsContext {
  pageUrl: string;
  supported: boolean;
  host: string | null;
  pageType: PageType;
  signals: PageSignals;
  candidates: number;
  /** 阶段 3：提取结果；缺省时按「阶段 2 探针」语义处理（extracted=0 且不判定结构变化） */
  extraction?: ExtractionOutcome;
  /** 实际扫描的开始/结束时间；缺省时退化为「组装诊断的瞬间」（durationMs 会是 0） */
  scanStartedAt?: string | null;
  scanFinishedAt?: string | null;
}

/** 判断是否疑似改版：页面确实是搜索结果页、卡片节点存在，却一条都取不出来 */
export function detectStructureChange(ctx: DiagnosticsContext): boolean {
  const extraction = ctx.extraction;
  if (!extraction) return false;
  if (ctx.pageType !== 'search_results') return false;
  if (ctx.signals.noteSections === 0) return false;
  return extraction.drafts.length === 0;
}

export function buildDiagnostics(ctx: DiagnosticsContext): ExtractionDiagnostics {
  // 优先用真实扫描时间；缺省时退化为组装瞬间（此时 durationMs 会接近 0）
  const startedAt = ctx.scanStartedAt ?? nowIso();
  const finishedAt = ctx.scanFinishedAt ?? nowIso();
  const startedMs = Date.parse(startedAt);
  const finishedMs = Date.parse(finishedAt);
  const durationMs =
    Number.isFinite(startedMs) && Number.isFinite(finishedMs)
      ? Math.max(0, finishedMs - startedMs)
      : 0;
  const errors: ExtractionDiagnostics['errors'] = [];
  const extraction = ctx.extraction;
  const extracted = extraction?.drafts.length ?? 0;
  const partial = extraction ? extraction.drafts.filter((d) => d.quality === 'partial').length : 0;
  const skipped = extraction?.skipped ?? 0;
  const skipReasons: Record<string, number> = { ...(extraction?.skipReasons ?? {}) };

  const push = (code: ErrorCode, detail?: string): void => {
    errors.push({ code, message: messageFor(code), ...(detail ? { detail } : {}) });
  };

  if (!ctx.supported) {
    push(ErrorCode.UNSUPPORTED_PAGE, `host=${ctx.host ?? 'unknown'}`);
  } else if (ctx.signals.captchaDetected) {
    push(ErrorCode.CAPTCHA_OR_RISK_CONTROL, 'signals.captchaDetected=true');
  } else if (ctx.signals.loginWallDetected) {
    push(ErrorCode.LOGIN_REQUIRED, 'signals.loginWallDetected=true');
  } else if (ctx.signals.readyState !== 'complete') {
    push(ErrorCode.PAGE_NOT_READY, `readyState=${ctx.signals.readyState}`);
  } else if (ctx.pageType !== 'search_results') {
    // 详情页/个人主页也可能残留搜索结果卡片（实测详情页是叠加层，底下 DOM 未卸载），
    // 因此这里的「识别卡片数」会非零但提取必然为 0。必须给出专门文案，不能只说"没有笔记"。
    push(
      ErrorCode.NOT_SEARCH_RESULTS,
      `pageType=${ctx.pageType}; noteSections=${ctx.signals.noteSections}; ` +
        `batch extraction is limited to search results`,
    );
  } else if (detectStructureChange(ctx)) {
    push(
      ErrorCode.DOM_STRUCTURE_CHANGED,
      `selectorVersion=${SELECTOR_VERSION}; noteSections=${ctx.signals.noteSections}; extracted=0; ` +
        `skipReasons=${JSON.stringify(skipReasons)}`,
    );
  } else if (ctx.candidates === 0 && ctx.signals.noteSections === 0) {
    push(
      ErrorCode.NO_VISIBLE_NOTES,
      `exploreLinks=${ctx.signals.exploreLinks}; noteSections=0; ` +
        `appShellRendered=${String(ctx.signals.appShellRendered)}`,
    );
  } else if (partial > 0) {
    push(ErrorCode.EXTRACTION_PARTIAL, `partial=${partial}/${extracted}`);
  }

  return {
    startedAt,
    finishedAt,
    durationMs,
    pageType: ctx.pageType,
    pageUrl: toPrivacySafePageUrl(ctx.pageUrl) ?? 'unknown',
    isSupported: ctx.supported,
    selectorVersion: SELECTOR_VERSION,
    totalCandidates: ctx.candidates,
    extracted,
    partial,
    skipped,
    skipReasons,
    signals: ctx.signals,
    errors,
  };
}

/** 单次扫描上限提示（供 UI 使用；不改错误码，避免把「可继续」当成失败） */
export const SCAN_LIMIT = MAX_CARDS_PER_SCAN;
