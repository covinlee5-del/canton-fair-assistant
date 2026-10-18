// 读取结果与诊断模型（docs/03 §8）

import type { ErrorCode, ISODate } from './base';

export type PageType = 'search_results' | 'note_detail' | 'profile' | 'other';

export interface NoteDraft {
  // 页面原始提取，规范化前
  url: string | null;
  title: string | null;
  snippet: string | null;
  publishedAtRaw: string | null;
  authorDisplayName: string | null;
  quality: 'complete' | 'partial';
  missingFields: Array<'url' | 'title' | 'snippet' | 'publishedAt'>;
}

export interface PageSignals {
  noteSections: number; // section.note-item 数量
  exploreLinks: number; // /explore/ 与 /discovery/item/ 链接数量
  uniqueNoteLinks: number; // 去重后的笔记链接数量
  resultContainers: number;
  appShellRendered: boolean;
  readyState: string;
  loginWallDetected: boolean; // 阶段 3 依据真实页面实测信号实现判定
  captchaDetected: boolean; // 阶段 3 依据真实页面实测信号实现判定
}

export interface ExtractionDiagnostics {
  startedAt: ISODate;
  finishedAt: ISODate;
  durationMs: number;
  pageType: PageType | null;
  pageUrl: string; // origin + pathname，不含查询参数（隐私）
  isSupported: boolean;
  selectorVersion: string;
  totalCandidates: number; // 识别的候选卡片数
  extracted: number; // 提取成功数
  partial: number; // 部分字段缺失数
  skipped: number;
  skipReasons: Record<string, number>;
  signals: PageSignals;
  errors: Array<{ code: ErrorCode; message: string; detail?: string }>;
}

export interface ReadPageResult {
  diagnostics: ExtractionDiagnostics;
  processed: {
    total: number;
    added: number;
    duplicates: number;
    failed: number;
    failureReasons: string[];
  };
}
