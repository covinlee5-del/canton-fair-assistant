// UI → SW 消息 API 封装（所有页面共用）

import { Message } from '../messaging/messages';
import type { DashboardData } from '../messaging/messages';
import { sendMessage } from '../platform/messaging';
import { fail, ok } from '../shared/utils/result';
import type { AppError, ID, Result } from '../shared/types/base';
import type { ExtractionDiagnostics } from '../shared/types/extraction';
import type { Settings } from '../shared/types/settings';
import type { Task, TaskInput, TaskStatus } from '../shared/types/task';

type Envelope<T> = { ok: true; value: T } | { ok: false; error: AppError };

async function unwrap<T>(envelope: Promise<Envelope<T>>): Promise<Result<T>> {
  const e = await envelope;
  return e.ok ? ok(e.value) : fail(e.error);
}

export const api = {
  dashboard: () => unwrap(sendMessage<DashboardData>(Message.GET_DASHBOARD, {})),

  readPage: () =>
    unwrap(sendMessage<ExtractionDiagnostics>(Message.READ_PAGE, {})),

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
};
