// 读取结果与诊断模型（docs/03 §8；阶段 3 T3.2/T3.6 扩展）

import type { ErrorCode, ISODate } from './base';
import type { Note } from './note';

export type PageType = 'search_results' | 'note_detail' | 'profile' | 'other';

/** 卡片提取失败/跳过原因（计入诊断的 skipReasons） */
export type SkipReason =
  | 'no-identifiable-content' // 既无笔记链接也无标题（懒加载占位卡片）
  | 'no-link' // 无链接，但有标题 → 走指纹兜底或按空链接记录
  | 'no-title' // 有链接无标题
  | 'duplicate-in-scan' // 同一次扫描内重复出现
  | 'scan-limit'; // 超出单次扫描上限

/**
 * 单张笔记卡片的原始提取结果（规范化前）。
 *
 * 字段来源全部是「卡片自身节点内」读到的可见内容，绝不跨节点拼接
 * （阶段 3 §4 风险表：虚拟滚动 / DOM 复用）。
 */
export interface NoteDraft {
  /** 卡片内笔记链接（已补全为绝对 URL，原样保留查询参数） */
  url: string | null;
  /** 规范化链接：https://www.xiaohongshu.com/explore/{id}；无 ID 时为 null */
  canonicalUrl: string | null;
  /**
   * 打开用的链接：canonicalUrl + 必要的授权参数（如 xsec_token）。
   * 与 canonicalUrl 分开存放，避免去重键随 token 变化。
   */
  openUrl: string | null;
  /** 24 位 hex 笔记 ID；无稳定链接时为 null（去重走指纹兜底） */
  noteId: string | null;
  /** 标题（已截断到 MAX_TITLE_LENGTH） */
  title: string | null;
  /** 可见摘要（已截断到 MAX_SNIPPET_LENGTH；搜索卡片常常没有） */
  snippet: string | null;
  /** 页面可见时间原文，如 “3 天前”“2026-03-05” */
  timeText: string | null;
  /** 与 timeText 相同，保留 docs/03 的字段命名以便回溯 */
  publishedAtRaw: string | null;
  /** 页面可见作者显示名，仅此而已 */
  authorDisplayName: string | null;
  quality: 'complete' | 'partial';
  missingFields: Array<'url' | 'title' | 'snippet' | 'publishedAt'>;
}

/** 一次提取的完整结果（含跳过统计，用于诊断与降级判定） */
export interface ExtractionOutcome {
  drafts: NoteDraft[];
  /** 候选卡片总数（含被跳过的） */
  totalCandidates: number;
  skipped: number;
  skipReasons: Partial<Record<SkipReason, number>>;
  /** 是否因为达到单次扫描上限而截断（提示用户滚动后再次读取） */
  truncated: boolean;
}

export interface PageSignals {
  noteSections: number; // 卡片容器数量
  exploreLinks: number; // /explore/ 与 /discovery/item/ 链接数量
  uniqueNoteLinks: number; // 去重后的笔记链接数量
  resultContainers: number;
  appShellRendered: boolean;
  readyState: string;
  loginWallDetected: boolean; // 登录墙信号（只检测，不绕过）
  captchaDetected: boolean; // 验证码/风控信号（只检测，不绕过）
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

/** read-page 的处理统计（docs/03 §8 ReadPageResult.processed） */
export interface ReadPageProcessed {
  total: number;
  added: number;
  duplicates: number;
  failed: number;
  failureReasons: string[];
}

/**
 * read-page 的返回结构（阶段 3 T3.6）。
 * 读取即落库：notes 是本次读取后「与当前任务关联」的笔记（含历史已存在记录）。
 */
export interface ReadPageResponse {
  diagnostics: ExtractionDiagnostics;
  notes: Note[];
  processed: ReadPageProcessed;
}

/** 兼容 docs/03 的旧命名 */
export type ReadPageResult = ReadPageResponse;
