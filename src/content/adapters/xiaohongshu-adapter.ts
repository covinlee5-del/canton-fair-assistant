// 小红书页面适配器（探针版）
// 阶段 2：只读诊断（结构信号统计），不做正式笔记提取。
// 阶段 3：依据 verification-results.md 的真实信号实现 extractVisibleNotes / normalizeNote。

import type { ExtractionValidation, PageAdapter } from './page-adapter';
import { collectSignals } from './selectors';
import { buildDiagnostics } from '../diagnostics';
import { parsePageUrl } from '../../shared/domain/normalization';
import type { ExtractionDiagnostics, NoteDraft, PageType } from '../../shared/types/extraction';

export function createXiaohongshuAdapter(pageUrl: string, doc: Document): PageAdapter {
  const parsed = parsePageUrl(pageUrl);
  const supported = parsed?.isXiaohongshu ?? false;
  const host = parsed?.host ?? null;
  const pageType = classifyPageType(parsed?.pathname ?? '');

  return {
    isSupportedPage: () => supported,
    getPageType: () => (supported ? pageType : 'other'),

    // 阶段 3 实现正式提取（当前返回空，绝不伪造数据）
    extractVisibleNotes: (): NoteDraft[] => [],

    normalizeNote: (draft: NoteDraft): NoteDraft => draft,

    getExtractionDiagnostics: (): ExtractionDiagnostics => {
      const signals = collectSignals(doc);
      return buildDiagnostics({
        pageUrl,
        supported,
        host,
        pageType,
        signals,
        candidates: signals.uniqueNoteLinks,
      });
    },

    validateExtractionResult: (drafts: NoteDraft[]): ExtractionValidation => {
      if (drafts.length === 0) {
        return { valid: false, problems: ['未提取到任何笔记'] };
      }
      return { valid: true, problems: [] };
    },
  };
}

/** 页面类型启发式分类（依据公开 URL 路径特征；真实环境以实测为准） */
export function classifyPageType(pathname: string): PageType {
  if (pathname.startsWith('/search_result') || pathname.startsWith('/search')) {
    return 'search_results';
  }
  if (/^\/(explore|discovery\/item)\//i.test(pathname)) {
    return 'note_detail';
  }
  if (pathname.startsWith('/user/profile')) {
    return 'profile';
  }
  return 'other';
}
