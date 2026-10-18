// 状态与等级展示标签

import { NoteStatus } from '../types/note';
import { TaskStatus } from '../types/task';
import type { RelevanceLevel } from '../types/note';

export const NOTE_STATUS_LABELS: Record<NoteStatus, string> = {
  [NoteStatus.NEW]: '新发现',
  [NoteStatus.REVIEWED]: '已审核',
  [NoteStatus.MARKED_FOR_CONTACT]: '待联系',
  [NoteStatus.PROMOTED]: '已完成推广',
  [NoteStatus.REPLIED]: '已收到回复',
  [NoteStatus.CONTACTED]: '已建立联系',
  [NoteStatus.IRRELEVANT]: '不相关',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  ACTIVE: '进行中',
  PAUSED: '已暂停',
  ARCHIVED: '已归档',
};

export const RELEVANCE_LEVEL_LABELS: Record<RelevanceLevel, string> = {
  high: '高相关',
  medium: '中相关',
  low: '低相关',
};
