// 设置命令处理器

import { register } from '../message-router';
import { Message } from '../../messaging/messages';
import type { SetDefaultTaskRequest } from '../../messaging/messages';
import { LocalSettingsRepository } from '../../data/settings-repository';
import { unwrap } from '../../shared/utils/result';

export function registerSettingsCommands(): void {
  const repo = new LocalSettingsRepository();

  register(Message.SETTINGS_GET, async () => unwrap(await repo.get()));

  register(Message.SETTINGS_SET_DEFAULT_TASK, async (payload) =>
    unwrap(await repo.update({ defaultTaskId: (payload as SetDefaultTaskRequest).taskId })),
  );
}
