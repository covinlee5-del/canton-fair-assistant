// 消息契约（docs/02 §7；阶段 3 T3.6 扩展 notes.*）
// 所有消息经 chrome.runtime.sendMessage，响应统一为 MessageEnvelope（Result 语义）。

import type { AppError, ID } from '../shared/types/base';
import type { Task, TaskInput, TaskStatus } from '../shared/types/task';
import type { Note, NoteStatus } from '../shared/types/note';
import type { ExtractionDiagnostics } from '../shared/types/extraction';
import type { CopyInput, PromotionalCopy } from '../shared/types/copy';
import type { ActivityAction } from '../shared/types/activity';

export const Message = {
  READ_PAGE: 'read-page',
  GET_DASHBOARD: 'get-dashboard',
  TASK_LIST: 'task.list',
  TASK_CREATE: 'task.create',
  TASK_UPDATE: 'task.update',
  TASK_DELETE: 'task.delete',
  TASK_DUPLICATE: 'task.duplicate',
  TASK_SET_STATUS: 'task.set-status',
  SETTINGS_GET: 'settings.get',
  SETTINGS_SET_DEFAULT_TASK: 'settings.set-default-task',
  // 阶段 3：笔记查询与状态标记
  NOTES_LIST: 'notes.list',
  NOTES_SET_STATUS: 'notes.set-note-status',
  NOTES_BULK_SET_STATUS: 'notes.bulk-set-status',
  NOTES_SCORE_TASK: 'notes.score-task',
  COPIES_LIST: 'copies.list',
  COPIES_CREATE: 'copies.create',
  COPIES_UPDATE: 'copies.update',
  COPIES_DELETE: 'copies.delete',
  COPIES_SET_DEFAULT: 'copies.set-default',
  ACTIVITY_RECORD: 'activity.record',
  ACTIVITY_LIST: 'activity.list',
} as const;

export type MessageName = (typeof Message)[keyof typeof Message];

export type MessageEnvelope<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppError };

export interface DashboardData {
  currentTask: Task | null;
  tasks: Task[];
  lastDiagnostics: ExtractionDiagnostics | null;
  /** 当前任务的笔记数（阶段 3 起） */
  noteCount: number;
}

export interface TaskListRequest {
  includeArchived?: boolean;
}

export interface TaskUpdateRequest {
  id: ID;
  input: TaskInput;
}

export interface TaskStatusRequest {
  id: ID;
  status: TaskStatus;
}

export interface SetDefaultTaskRequest {
  taskId: ID | null;
}

/** notes.list 请求（阶段 3 T3.6） */
export interface NotesListRequest {
  /** 只看某个任务的笔记；null/缺省 = 全部 */
  taskId?: ID | null;
  /** 只看某个状态；null/缺省 = 全部 */
  status?: NoteStatus | null;
  /** 本地关键词过滤（标题/作者/摘要） */
  keyword?: string | null;
  sortBy?: 'relevance' | 'publishedAt' | 'updatedAt' | 'status';
  sortOrder?: 'asc' | 'desc';
  minScore?: number | null;
}

export interface NotesBulkStatusRequest {
  ids: ID[];
  status: NoteStatus;
  taskId?: ID | null;
}

export interface NotesScoreTaskRequest {
  taskId: ID;
}

export interface CopyUpdateRequest {
  id: ID;
  input: CopyInput;
}

export interface CopyIdRequest {
  id: ID;
}

export interface ActivityRecordRequest {
  noteId: ID;
  taskId?: ID | null;
  action: ActivityAction.OPEN_NOTE | ActivityAction.COPY_TEXT;
  copyId?: ID;
}

export interface ActivityListRequest {
  noteId?: ID | null;
  taskId?: ID | null;
}

/** notes.set-note-status 请求（阶段 3 T3.6） */
export interface NoteStatusRequest {
  id: ID;
  status: NoteStatus;
  /** 从哪个任务视角标记（可选，用于活动记录） */
  taskId?: ID | null;
}

export type { Note };
export type { PromotionalCopy };
