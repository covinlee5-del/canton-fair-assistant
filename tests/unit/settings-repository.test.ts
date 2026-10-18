import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LocalSettingsRepository,
  mergeSettings,
} from '../../src/data/settings-repository';
import { DEFAULT_SETTINGS } from '../../src/shared/types/settings';

const store = new Map<string, unknown>();

const chromeMock = {
  storage: {
    local: {
      async get(key: string): Promise<Record<string, unknown>> {
        return store.has(key) ? { [key]: store.get(key) } : {};
      },
      async set(record: Record<string, unknown>): Promise<void> {
        for (const [k, v] of Object.entries(record)) store.set(k, v);
      },
      async remove(key: string): Promise<void> {
        store.delete(key);
      },
    },
  },
};

beforeEach(() => {
  store.clear();
  vi.stubGlobal('chrome', chromeMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mergeSettings', () => {
  it('空输入返回完整默认值', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('深合并嵌套字段而不丢失默认值', () => {
    const merged = mergeSettings({ uiPrefs: { pageSize: 50 } as never }, {
      privacy: { keepDiagnostics: false },
    });
    expect(merged.uiPrefs.pageSize).toBe(50);
    expect(merged.uiPrefs.theme).toBe(DEFAULT_SETTINGS.uiPrefs.theme);
    expect(merged.privacy.keepDiagnostics).toBe(false);
    expect(merged.privacy).toEqual({ keepDiagnostics: false });
  });

  it('相关性规则局部覆盖时保留其他默认权重', () => {
    const merged = mergeSettings(null, {
      defaultRelevanceConfig: { ...DEFAULT_SETTINGS.defaultRelevanceConfig, highThreshold: 70 },
    });
    expect(merged.defaultRelevanceConfig.highThreshold).toBe(70);
    expect(merged.defaultRelevanceConfig.titleWeight).toBe(
      DEFAULT_SETTINGS.defaultRelevanceConfig.titleWeight,
    );
  });
});

describe('LocalSettingsRepository', () => {
  it('首次读取返回默认设置', async () => {
    const repo = new LocalSettingsRepository();
    const res = await repo.get();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.defaultTaskId).toBeNull();
  });

  it('更新后持久化并可再次读取', async () => {
    const repo = new LocalSettingsRepository();
    const updated = await repo.update({ defaultTaskId: 'task-1' });
    expect(updated.ok).toBe(true);
    const reread = await repo.get();
    if (reread.ok) expect(reread.value.defaultTaskId).toBe('task-1');
  });

  it('存储异常返回 STORAGE_ERROR 而非抛出', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          async get(): Promise<Record<string, unknown>> {
            throw new Error('quota exceeded');
          },
          async set(): Promise<void> {
            throw new Error('quota exceeded');
          },
        },
      },
    });
    const repo = new LocalSettingsRepository();
    const res = await repo.get();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('STORAGE_ERROR');
      expect(res.error.detail).toContain('quota exceeded');
    }
  });
});
