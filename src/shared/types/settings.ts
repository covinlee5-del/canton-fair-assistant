// 设置模型（docs/03 §7）
// 不保存平台密码、Cookie 或会话凭证（任何形式）。

import type { ID, ISODate } from './base';
import type { RelevanceConfig } from './task';

export interface Settings {
  defaultTaskId: ID | null;
  defaultCopyId: ID | null;
  defaultRelevanceConfig: RelevanceConfig;
  uiPrefs: {
    theme: 'light' | 'dark' | 'system';
    collapsedLowRelevance: boolean;
    pageSize: number;
  };
  backup: {
    lastExportAt: ISODate | null;
    exportReminder: boolean;
  };
  privacy: {
    keepDiagnostics: boolean; // 诊断仅存本地，永不上传
  };
}

export const DEFAULT_SETTINGS: Settings = {
  defaultTaskId: null,
  defaultCopyId: null,
  defaultRelevanceConfig: {
    titleWeight: 3,
    snippetWeight: 1,
    categoryBonus: 10,
    timeInRangeBonus: 5,
    timeOutOfRangePenalty: -10,
    negativeKeywordPenalty: -15,
    negativeKeywords: [],
    highThreshold: 50,
    mediumThreshold: 27,
  },
  uiPrefs: {
    theme: 'system',
    collapsedLowRelevance: true,
    pageSize: 20,
  },
  backup: {
    lastExportAt: null,
    exportReminder: true,
  },
  privacy: {
    keepDiagnostics: true,
  },
};
