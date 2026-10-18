// 消息契约（docs/02 §7）
// 所有消息经 chrome.runtime.sendMessage，响应统一为 MessageEnvelope（Result 语义）。

import type { AppError, ID } from '../shared/types/base';
import type { Task, TaskInput, TaskStatus } from '../shared/types/task';
import type { ExtractionDiagnostics } from '../shared/types/extraction';

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
} as const;

export type MessageName = (typeof Message)[keyof typeof Message];

export type MessageEnvelope<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppError };

export interface DashboardData {
  currentTask: Task | null;
  tasks: Task[];
  lastDiagnostics: ExtractionDiagnostics | null;
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
