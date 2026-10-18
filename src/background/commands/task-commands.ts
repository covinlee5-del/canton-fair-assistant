// 任务命令处理器（docs/06 T2.4）
// 契约：服务层返回 Result，本层用 unwrap 拆包（失败即抛 AppError），
// 由消息路由器统一包装成一层信封。

import { register } from '../message-router';
import { Message } from '../../messaging/messages';
import type {
  TaskListRequest,
  TaskStatusRequest,
  TaskUpdateRequest,
} from '../../messaging/messages';
import { TaskRepository } from '../../data/task-repository';
import {
  createTask,
  deleteTask,
  duplicateTask,
  listTasks,
  setTaskStatus,
  updateTask,
} from '../../services/task-service';
import { unwrap } from '../../shared/utils/result';
import type { TaskInput } from '../../shared/types/task';

export function registerTaskCommands(): void {
  const repo = new TaskRepository();

  register(Message.TASK_LIST, async (payload) =>
    unwrap(await listTasks(repo, (payload as TaskListRequest | undefined)?.includeArchived ?? false)),
  );

  register(Message.TASK_CREATE, async (payload) =>
    unwrap(await createTask(repo, (payload as { input: TaskInput }).input)),
  );

  register(Message.TASK_UPDATE, async (payload) => {
    const p = payload as TaskUpdateRequest;
    return unwrap(await updateTask(repo, p.id, p.input));
  });

  register(Message.TASK_DELETE, async (payload) =>
    unwrap(await deleteTask(repo, (payload as { id: string }).id)),
  );

  register(Message.TASK_DUPLICATE, async (payload) =>
    unwrap(await duplicateTask(repo, (payload as { id: string }).id)),
  );

  register(Message.TASK_SET_STATUS, async (payload) => {
    const p = payload as TaskStatusRequest;
    return unwrap(await setTaskStatus(repo, p.id, p.status));
  });
}
