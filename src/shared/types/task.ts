// 任务模型（docs/03 §3）

import type { ID, ISODate } from './base';

export enum TaskCategory {
  CANTON_FAIR = 'CANTON_FAIR',
  FOREIGN_BUYER = 'FOREIGN_BUYER',
  INTERPRETER = 'INTERPRETER',
  EXHIBITION_COMPANION = 'EXHIBITION_COMPANION',
  BUSINESS_RECEPTION = 'BUSINESS_RECEPTION',
  OTHER = 'OTHER',
}

export type TaskLanguage = 'zh' | 'en' | 'mixed';
export type TaskStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

export interface DateRange {
  from: ISODate | null;
  to: ISODate | null;
}

/** 可配置的相关性评分规则（docs/03 §3） */
export interface RelevanceConfig {
  titleWeight: number; // 标题命中权重（默认 3）
  snippetWeight: number; // 摘要命中权重（默认 1）
  categoryBonus: number; // 场景关键词组命中加分（默认 10）
  timeInRangeBonus: number; // 发布时间在目标区间内加分（默认 5）
  timeOutOfRangePenalty: number; // 发布时间在区间外扣分（默认 -10）
  negativeKeywordPenalty: number; // 每条负向关键词扣分（默认 -15）
  negativeKeywords: string[]; // 默认空
  highThreshold: number; // 高相关阈值（0-100 分制，默认 50）
  mediumThreshold: number; // 中相关阈值（默认 27）
}

/** 创建/编辑任务的用户输入（不含 id/时间戳/状态） */
export interface TaskInput {
  name: string;
  keywords: string[];
  language: TaskLanguage;
  category: TaskCategory;
  dateRange: DateRange;
  relevanceConfig: RelevanceConfig | null; // null 表示使用默认配置
  copyIds: ID[]; // 关联宣传文案（阶段 4 使用）
  notes: string; // 用户备注
}

export interface Task {
  id: ID;
  name: string;
  keywords: string[];
  language: TaskLanguage;
  category: TaskCategory;
  dateRange: DateRange;
  relevanceConfig: RelevanceConfig;
  copyIds: ID[];
  status: TaskStatus;
  notes: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}
