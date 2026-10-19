// UI → SW 消息 API 封装（所有页面共用）

import { Message } from '../messaging/messages';
import type { DashboardData, NotesListRequest } from '../messaging/messages';
import { sendMessage } from '../platform/messaging';
import { fail, ok } from '../shared/utils/result';
import type { AppError, ID, Result } from '../shared/types/base';
import type { ReadPageResponse } from '../shared/types/extraction';
import type { Note, NoteStatus } from '../shared/types/note';
import type { CopyInput, PromotionalCopy } from '../shared/types/copy';
import type { OutreachActivity } from '../shared/types/activity';
import type { Settings } from '../shared/types/settings';
import type { Task, TaskInput, TaskStatus } from '../shared/types/task';

type Envelope<T> = { ok: true; value: T } | { ok: false; error: AppError };

async function unwrap<T>(envelope: Promise<Envelope<T>>): Promise<Result<T>> {
  const e = await envelope;
  return e.ok ? ok(e.value) : fail(e.error);
}

export const api = {
  dashboard: () => unwrap(sendMessage<DashboardData>(Message.GET_DASHBOARD, {})),

  /** 阶段 3：读取即落库，返回诊断 + 当前任务视角的笔记清单 */
  readPage: () => unwrap(sendMessage<ReadPageResponse>(Message.READ_PAGE, {})),

  taskList: (includeArchived = false) =>
    unwrap(sendMessage<Task[]>(Message.TASK_LIST, { includeArchived })),

  taskCreate: (input: TaskInput) =>
    unwrap(sendMessage<Task>(Message.TASK_CREATE, { input })),

  taskUpdate: (id: ID, input: TaskInput) =>
    unwrap(sendMessage<Task>(Message.TASK_UPDATE, { id, input })),

  taskDelete: (id: ID) =>
    unwrap(sendMessage<void>(Message.TASK_DELETE, { id })),

  taskDuplicate: (id: ID) =>
    unwrap(sendMessage<Task>(Message.TASK_DUPLICATE, { id })),

  taskSetStatus: (id: ID, status: TaskStatus) =>
    unwrap(sendMessage<Task>(Message.TASK_SET_STATUS, { id, status })),

  settingsGet: () => unwrap(sendMessage<Settings>(Message.SETTINGS_GET, {})),

  setDefaultTask: (taskId: ID | null) =>
    unwrap(sendMessage<Settings>(Message.SETTINGS_SET_DEFAULT_TASK, { taskId })),

  // 阶段 3：笔记查询与状态标记
  notesList: (request: NotesListRequest = {}) =>
    unwrap(sendMessage<Note[]>(Message.NOTES_LIST, request)),

  noteSetStatus: (id: ID, status: NoteStatus, taskId: ID | null = null) =>
    unwrap(sendMessage<Note>(Message.NOTES_SET_STATUS, { id, status, taskId })),

  notesBulkSetStatus: (ids: ID[], status: NoteStatus, taskId: ID | null = null) =>
    unwrap(sendMessage<Note[]>(Message.NOTES_BULK_SET_STATUS, { ids, status, taskId })),

  notesScoreTask: (taskId: ID) => unwrap(sendMessage<Note[]>(Message.NOTES_SCORE_TASK, { taskId })),

  copiesList: () => unwrap(sendMessage<PromotionalCopy[]>(Message.COPIES_LIST, {})),
  copyCreate: (input: CopyInput) => unwrap(sendMessage<PromotionalCopy>(Message.COPIES_CREATE, { input })),
  copyUpdate: (id: ID, input: CopyInput) => unwrap(sendMessage<PromotionalCopy>(Message.COPIES_UPDATE, { id, input })),
  copyDelete: (id: ID) => unwrap(sendMessage<void>(Message.COPIES_DELETE, { id })),
  copySetDefault: (id: ID) => unwrap(sendMessage<PromotionalCopy>(Message.COPIES_SET_DEFAULT, { id })),

  recordActivity: (input: { noteId: ID; taskId?: ID | null; action: 'OPEN_NOTE' | 'COPY_TEXT'; copyId?: ID }) =>
    unwrap(sendMessage<OutreachActivity>(Message.ACTIVITY_RECORD, input)),
  activityList: (noteId?: ID | null, taskId?: ID | null) =>
    unwrap(sendMessage<OutreachActivity[]>(Message.ACTIVITY_LIST, { noteId, taskId })),
};
