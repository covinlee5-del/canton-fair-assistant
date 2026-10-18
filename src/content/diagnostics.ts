// 诊断信息组装（docs/03 §8、docs/04 §1）
// 隐私约束：pageUrl 仅 origin+pathname；不含笔记正文、用户信息、Cookie。

import { ErrorCode } from '../shared/types/base';
import { messageFor } from '../shared/constants/error-codes';
import { nowIso } from '../shared/utils/time';
import { toPrivacySafePageUrl } from '../shared/domain/normalization';
import { SELECTOR_VERSION } from './adapters/selectors';
import type {
  ExtractionDiagnostics,
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
}

export function buildDiagnostics(ctx: DiagnosticsContext): ExtractionDiagnostics {
  const startedAt = nowIso();
  const startedMs = Date.now();
  const errors: ExtractionDiagnostics['errors'] = [];

  if (!ctx.supported) {
    errors.push({
      code: ErrorCode.UNSUPPORTED_PAGE,
      message: messageFor(ErrorCode.UNSUPPORTED_PAGE),
      detail: `host=${ctx.host ?? 'unknown'}`,
    });
  } else if (ctx.signals.readyState !== 'complete') {
    errors.push({
      code: ErrorCode.PAGE_NOT_READY,
      message: messageFor(ErrorCode.PAGE_NOT_READY),
      detail: `readyState=${ctx.signals.readyState}`,
    });
  } else if (ctx.candidates === 0 && ctx.signals.noteSections === 0) {
    // 可能是未登录/验证墙/无结果页；具体判定模式待阶段 3 实测后编码
    errors.push({
      code: ErrorCode.NO_VISIBLE_NOTES,
      message: messageFor(ErrorCode.NO_VISIBLE_NOTES),
    });
  }

  return {
    startedAt,
    finishedAt: nowIso(),
    durationMs: Date.now() - startedMs,
    pageType: ctx.pageType,
    pageUrl: toPrivacySafePageUrl(ctx.pageUrl) ?? 'unknown',
    isSupported: ctx.supported,
    selectorVersion: SELECTOR_VERSION,
    totalCandidates: ctx.candidates,
    extracted: 0,
    partial: 0,
    skipped: 0,
    skipReasons: {},
    signals: ctx.signals,
    errors,
  };
}
