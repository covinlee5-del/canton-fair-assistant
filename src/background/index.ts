// Service Worker 入口（MV3）
// 职责：消息路由注册、命令注册、侧边栏行为。
// 注意：SW 可能随时被终止——所有重要状态都已持久化，恢复以本地记录为准。

import { initMessageRouter } from './message-router';
import { registerTaskCommands } from './commands/task-commands';
import { registerSettingsCommands } from './commands/settings-commands';
import { registerDashboardCommand } from './commands/dashboard-commands';
import { registerReadPageCommand } from './commands/read-page';
import { registerNoteCommands } from './commands/note-commands';
import { registerCopyCommands } from './commands/copy-commands';
import { registerActivityCommands } from './commands/activity-commands';
import { registerLifecycleHooks } from './lifecycle';
import { isSidePanelSupported } from '../platform/side-panel';

function main(): void {
  initMessageRouter();
  registerTaskCommands();
  registerSettingsCommands();
  registerDashboardCommand();
  registerReadPageCommand();
  registerNoteCommands();
  registerCopyCommands();
  registerActivityCommands();
  registerLifecycleHooks();

  // 点击扩展图标直接打开侧边栏（Chrome 114+）
  if (isSidePanelSupported()) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch(() => {
        // 降级：用户仍可通过工具栏图标菜单手动打开侧边栏
      });
  }
}

main();
