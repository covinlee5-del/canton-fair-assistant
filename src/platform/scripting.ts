// scripting API 薄封装：按需注入内容脚本（权限依据 host_permissions 站点权限）
//
// 两段式注入的原因：内容脚本被构建为 IIFE 单文件，其脚本完成值为空，
// 无法直接从 executeScript 的返回值取到结果。因此：
//   1) 注入 content.js —— 执行只读扫描并把结果写到 isolated world 的全局对象；
//   2) 注入一个自包含函数 —— 在同一 isolated world 里把结果读回来。
// 两次注入都发生在用户点击“读取”之后。

import type { ExtractionDiagnostics, NoteDraft } from '../shared/types/extraction';
import {
  DIAGNOSTICS_GLOBAL_KEY,
  NOTES_GLOBAL_KEY,
} from '../shared/constants/content-globals';

export interface PageReadPayload {
  diagnostics: ExtractionDiagnostics;
  drafts: NoteDraft[];
}

/** 注入函数必须自包含（不能引用外部变量），参数只能是可序列化值 */
function readScanResultFromGlobal(keys: { diagnostics: string; notes: string }): unknown {
  const store = globalThis as unknown as Record<string, unknown>;
  return {
    diagnostics: store[keys.diagnostics] ?? null,
    notes: store[keys.notes] ?? null,
  };
}

export async function executeContentScript(tabId: number): Promise<PageReadPayload> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js'],
  });

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: readScanResultFromGlobal,
    args: [{ diagnostics: DIAGNOSTICS_GLOBAL_KEY, notes: NOTES_GLOBAL_KEY }],
  });

  const value = results[0]?.result as { diagnostics?: unknown; notes?: unknown } | null | undefined;
  if (!value || value.diagnostics == null) {
    throw new Error('内容脚本未产生诊断结果（页面可能不允许注入）');
  }
  const notes = Array.isArray(value.notes) ? (value.notes as NoteDraft[]) : [];
  return {
    diagnostics: value.diagnostics as ExtractionDiagnostics,
    drafts: notes,
  };
}
