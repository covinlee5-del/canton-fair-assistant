// 页面适配器接口（docs/04、docs/06 T2.5）
// 职责：判断页面是否支持、识别页面类型、提取可见笔记、规范化、诊断、结果校验。
// 平台页面变化时只改适配器实现，不改业务层。

import type { ExtractionDiagnostics, NoteDraft, PageType } from '../../shared/types/extraction';

export interface ExtractionValidation {
  valid: boolean;
  problems: string[];
}

export interface PageAdapter {
  isSupportedPage(): boolean;
  getPageType(): PageType;
  extractVisibleNotes(): NoteDraft[];
  normalizeNote(draft: NoteDraft): NoteDraft;
  getExtractionDiagnostics(): ExtractionDiagnostics;
  validateExtractionResult(drafts: NoteDraft[]): ExtractionValidation;
}
