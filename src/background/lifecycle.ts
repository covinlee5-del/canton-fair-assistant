// 生命周期钩子：仅记录安装信息（不含任何敏感数据）

import { storageSet } from '../platform/storage';
import { STORAGE_KEYS } from '../shared/constants/storage-keys';

export function registerLifecycleHooks(): void {
  chrome.runtime.onInstalled.addListener((details) => {
    void storageSet(STORAGE_KEYS.installInfo, {
      reason: details.reason,
      version: chrome.runtime.getManifest().version,
      at: new Date().toISOString(),
    }).catch(() => {
      // 记录失败不影响主流程；存储异常会由业务命令显式上报
    });
  });
}
