// 读取当前页面命令：注入只读诊断探针（docs/06 T2.5）
// 权限策略：activeTab + scripting；失败时返回面向用户的错误码与引导文案。

import { register } from '../message-router';
import { Message } from '../../messaging/messages';
import { getActiveTab } from '../../platform/tabs';
import { executeContentScript } from '../../platform/scripting';
import { storageSet } from '../../platform/storage';
import { STORAGE_KEYS } from '../../shared/constants/storage-keys';
import { parsePageUrl } from '../../shared/domain/normalization';
import { appError, storageError } from '../../shared/utils/result';
import { ErrorCode } from '../../shared/types/base';
import type { ExtractionDiagnostics } from '../../shared/types/extraction';

async function readCurrentPage(): Promise<ExtractionDiagnostics> {
  const tab = await getActiveTab();
  if (!tab || tab.id == null) {
    throw appError(ErrorCode.PERMISSION_DENIED, '无法获取当前标签页');
  }
  if (!tab.url) {
    // activeTab 未授权时 url 不可读
    throw appError(ErrorCode.PERMISSION_DENIED, '无法读取当前页面地址（可能未授权）');
  }
  const parsed = parsePageUrl(tab.url);
  if (!parsed || !parsed.isXiaohongshu) {
    throw appError(ErrorCode.UNSUPPORTED_PAGE, `host=${parsed?.host ?? 'unknown'}`);
  }

  let diagnostics: ExtractionDiagnostics;
  try {
    diagnostics = await executeContentScript(tab.id);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw appError(ErrorCode.PERMISSION_DENIED, `注入失败: ${detail}`, cause);
  }

  try {
    await storageSet(STORAGE_KEYS.lastDiagnostics, diagnostics);
  } catch (cause) {
    throw storageError('保存诊断结果失败', cause);
  }
  return diagnostics;
}

export function registerReadPageCommand(): void {
  // 处理器返回纯值；失败以抛错形式交给路由器包装为信封
  register(Message.READ_PAGE, () => readCurrentPage());
}
