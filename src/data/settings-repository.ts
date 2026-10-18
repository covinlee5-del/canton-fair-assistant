// 设置仓库：底层使用 chrome.storage.local（轻量键值）
// 读写失败返回 STORAGE_ERROR，绝不静默。

import { fail, ok, storageError } from '../shared/utils/result';
import { storageGet, storageSet } from '../platform/storage';
import { STORAGE_KEYS } from '../shared/constants/storage-keys';
import { DEFAULT_SETTINGS } from '../shared/types/settings';
import type { Settings } from '../shared/types/settings';
import type { Result } from '../shared/types/base';

export interface SettingsRepository {
  get(): Promise<Result<Settings>>;
  update(patch: Partial<Settings>): Promise<Result<Settings>>;
}

export class LocalSettingsRepository implements SettingsRepository {
  async get(): Promise<Result<Settings>> {
    try {
      const stored = await storageGet<Partial<Settings>>(STORAGE_KEYS.settings);
      return ok(mergeSettings(stored));
    } catch (cause) {
      return fail(storageError('读取设置失败', cause));
    }
  }

  async update(patch: Partial<Settings>): Promise<Result<Settings>> {
    const current = await this.get();
    if (!current.ok) return current;
    try {
      const next = mergeSettings(current.value, patch);
      await storageSet(STORAGE_KEYS.settings, next);
      return ok(next);
    } catch (cause) {
      return fail(storageError('保存设置失败', cause));
    }
  }
}

/** 与默认值深合并（浅字段 + 三个嵌套对象） */
export function mergeSettings(
  base: Partial<Settings> | null | undefined,
  patch: Partial<Settings> = {},
): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...(base ?? {}),
    ...patch,
    uiPrefs: {
      ...DEFAULT_SETTINGS.uiPrefs,
      ...(base?.uiPrefs ?? {}),
      ...(patch.uiPrefs ?? {}),
    },
    backup: {
      ...DEFAULT_SETTINGS.backup,
      ...(base?.backup ?? {}),
      ...(patch.backup ?? {}),
    },
    privacy: {
      ...DEFAULT_SETTINGS.privacy,
      ...(base?.privacy ?? {}),
      ...(patch.privacy ?? {}),
    },
    defaultRelevanceConfig: {
      ...DEFAULT_SETTINGS.defaultRelevanceConfig,
      ...(base?.defaultRelevanceConfig ?? {}),
      ...(patch.defaultRelevanceConfig ?? {}),
    },
  };
}
