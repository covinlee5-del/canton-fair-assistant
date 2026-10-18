// 宣传文案模型（docs/03 §5）

import type { ID, ISODate } from './base';
import type { TaskCategory } from './task';

export type CopyLanguage = 'zh' | 'en' | 'bilingual';

export interface PromotionalCopy {
  id: ID;
  name: string;
  content: string;
  language: CopyLanguage;
  scenario: TaskCategory | 'GENERAL';
  tags: string[];
  isDefault: boolean; // 全局唯一默认文案
  createdAt: ISODate;
  updatedAt: ISODate;
}
