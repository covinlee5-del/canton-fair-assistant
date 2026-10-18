// 导出/导入模型（docs/03 §9）

import type { ISODate } from './base';
import type { Task } from './task';
import type { Note } from './note';
import type { PromotionalCopy } from './copy';
import type { OutreachActivity } from './activity';
import type { Settings } from './settings';

export interface ExportBundle {
  format: 'canton-fair-assistant-backup';
  schemaVersion: number; // 1
  exportedAt: ISODate;
  appVersion: string;
  data: {
    tasks: Task[];
    notes: Note[];
    copies: PromotionalCopy[];
    activities: OutreachActivity[];
    settings: Settings | null;
  };
}
