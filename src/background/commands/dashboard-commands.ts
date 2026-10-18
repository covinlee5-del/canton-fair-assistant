// 首页概况命令（侧边栏首页使用）

import { register } from '../message-router';
import { Message } from '../../messaging/messages';
import type { DashboardData } from '../../messaging/messages';
import { TaskRepository } from '../../data/task-repository';
import { LocalSettingsRepository } from '../../data/settings-repository';
import { storageGet } from '../../platform/storage';
import { STORAGE_KEYS } from '../../shared/constants/storage-keys';
import { unwrap } from '../../shared/utils/result';
import type { ExtractionDiagnostics } from '../../shared/types/extraction';

export function registerDashboardCommand(): void {
  register(Message.GET_DASHBOARD, async (): Promise<DashboardData> => {
    const taskRepo = new TaskRepository();
    const settingsRepo = new LocalSettingsRepository();
    const tasks = unwrap(await taskRepo.getAll());
    const settings = unwrap(await settingsRepo.get());
    const lastDiagnostics = await storageGet<ExtractionDiagnostics>(
      STORAGE_KEYS.lastDiagnostics,
    ).catch(() => null);
    const currentTask = tasks.find((t) => t.id === settings.defaultTaskId) ?? null;
    return { currentTask, tasks, lastDiagnostics };
  });
}
