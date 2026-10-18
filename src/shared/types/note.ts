// 笔记模型（docs/03 §4）

import type { ID, ISODate } from './base';

export enum NoteStatus {
  NEW = 'NEW',
  REVIEWED = 'REVIEWED',
  MARKED_FOR_CONTACT = 'MARKED_FOR_CONTACT',
  PROMOTED = 'PROMOTED',
  REPLIED = 'REPLIED',
  CONTACTED = 'CONTACTED',
  IRRELEVANT = 'IRRELEVANT',
}

export type RelevanceLevel = 'high' | 'medium' | 'low';

export interface RelevanceReason {
  rule: string; // 规则名，如 "title-keyword" "category-match" "time-in-range"
  description: string; // 面向用户解释
  scoreDelta: number; // 该规则贡献的原始分
}

export interface RelevanceResult {
  taskId: ID;
  score: number; // 0–100
  level: RelevanceLevel;
  matchedKeywords: string[];
  reasons: RelevanceReason[];
  evaluatedAt: ISODate;
}

export interface Note {
  id: ID;
  canonicalUrl: string; // https://www.xiaohongshu.com/explore/{noteId}
  dedupeKey: string; // "url:{noteId}" 或 "fp:{fingerprint}"
  dedupeKeyType: 'url' | 'fingerprint';
  title: string;
  contentSnippet: string | null;
  publishedAt: ISODate | null; // 无法确定时为 null
  publishedAtRaw: string | null; // 页面原文（如“3 天前”）
  authorDisplayName: string | null; // 页面可见显示名，仅此而已
  relevance: RelevanceResult; // 最近一次评估（列表展示用）
  relevanceByTask: Record<ID, RelevanceResult>; // 各任务视角
  sourcePageUrl: string; // 仅 origin + pathname
  extractedAt: ISODate;
  extractionVersion: string;
  extractionQuality: 'complete' | 'partial';
  taskIds: ID[];
  status: NoteStatus;
  userNotes: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}
