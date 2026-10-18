// 推广活动模型（docs/03 §6）
// 语义区分：OPEN_NOTE ≠ 已推广；COPY_TEXT ≠ 已发布；
// MARK_PROMOTED / MARK_REPLIED / MARK_CONTACTED 只能由用户显式操作产生。

import type { ID, ISODate } from './base';

export enum ActivityAction {
  OPEN_NOTE = 'OPEN_NOTE',
  COPY_TEXT = 'COPY_TEXT',
  MARK_REVIEWED = 'MARK_REVIEWED',
  MARK_FOR_CONTACT = 'MARK_FOR_CONTACT',
  MARK_PROMOTED = 'MARK_PROMOTED',
  MARK_REPLIED = 'MARK_REPLIED',
  MARK_CONTACTED = 'MARK_CONTACTED',
  MARK_IRRELEVANT = 'MARK_IRRELEVANT',
  ADD_NOTE = 'ADD_NOTE',
  EDIT_NOTE = 'EDIT_NOTE',
  TASK_CREATED = 'TASK_CREATED',
  TASK_UPDATED = 'TASK_UPDATED',
  TASK_DELETED = 'TASK_DELETED',
}

export interface OutreachActivity {
  id: ID;
  noteId: ID | null;
  taskId: ID | null;
  action: ActivityAction;
  actionAt: ISODate;
  copyId?: ID;
  result?: string;
  userComment?: string;
}
