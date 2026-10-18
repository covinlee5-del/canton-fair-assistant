// scripting API 薄封装：按需注入内容脚本（配合 activeTab）
//
// 两段式注入的原因：内容脚本被构建为 IIFE 单文件，其脚本完成值为空，
// 无法直接从 executeScript 的返回值取到结果。因此：
//   1) 注入 content.js —— 执行诊断并把结果写到 isolated world 的全局对象；
//   2) 注入一个自包含函数 —— 在同一 isolated world 里把结果读回来。
// 两次注入都发生在用户点击“读取”之后，仍属于 activeTab 临时授权范围。

import type { ExtractionDiagnostics } from '../shared/types/extraction';
import { DIAGNOSTICS_GLOBAL_KEY } from '../shared/constants/content-globals';

/** 注入函数必须自包含（不能引用外部变量），参数只能是可序列化值 */
function readDiagnosticsFromGlobal(key: string): unknown {
  return (globalThis as unknown as Record<string, unknown>)[key] ?? null;
}

export async function executeContentScript(tabId: number): Promise<ExtractionDiagnostics> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js'],
  });

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: readDiagnosticsFromGlobal,
    args: [DIAGNOSTICS_GLOBAL_KEY],
  });

  const value = results[0]?.result;
  if (value == null) {
    throw new Error('内容脚本未产生诊断结果（页面可能不允许注入）');
  }
  return value as ExtractionDiagnostics;
}
