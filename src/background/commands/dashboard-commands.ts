// 首页概况命令（侧边栏首页使用；阶段 3 增加当前任务的笔记数）

import { register } from '../message-router';
import { Message } from '../../messaging/messages';
import type { DashboardData } from '../../messaging/messages';
import { TaskRepository } from '../../data/task-repository';
import { NoteRepository } from '../../data/note-repository';
import { LocalSettingsRepository } from '../../data/settings-repository';
import { storageGet } from '../../platform/storage';
import { STORAGE_KEYS } from '../../shared/constants/storage-keys';
import { unwrap } from '../../shared/utils/result';
import type { ExtractionDiagnostics } from '../../shared/types/extraction';

export function registerDashboardCommand(): void {
  register(Message.GET_DASHBOARD, async (): Promise<DashboardData> => {
    const taskRepo = new TaskRepository();
    const noteRepo = new NoteRepository();
    const settingsRepo = new LocalSettingsRepository();
    const tasks = unwrap(await taskRepo.getAll());
    const settings = unwrap(await settingsRepo.get());
    const lastDiagnostics = await storageGet<ExtractionDiagnostics>(
      STORAGE_KEYS.lastDiagnostics,
    ).catch(() => null);
    const currentTask = tasks.find((t) => t.id === settings.defaultTaskId) ?? null;

    // 笔记数：有当前任务时按任务统计，否则统计全部
    const notes = currentTask
      ? await noteRepo.listByTaskId(currentTask.id)
      : await noteRepo.getAll();
    const noteCount = notes.ok ? notes.value.length : 0;

    return { currentTask, tasks, lastDiagnostics, noteCount };
  });
}
