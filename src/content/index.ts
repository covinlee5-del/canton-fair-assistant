// 内容脚本入口（按需注入，IIFE 打包为 dist/content.js）
//
// 注意：打包成 IIFE 后整个文件是「变量赋值语句」，脚本完成值为空 ——
// 因此不能依赖 executeScript 的返回值拿到诊断结果。
// 这里把结果显式写到 isolated world 的全局对象上，
// 由 background 侧二次注入自包含函数读回（见 src/platform/scripting.ts）。

import { createXiaohongshuAdapter } from './adapters/xiaohongshu-adapter';
import { DIAGNOSTICS_GLOBAL_KEY } from '../shared/constants/content-globals';

const diagnostics = createXiaohongshuAdapter(
  window.location.href,
  document,
).getExtractionDiagnostics();

(globalThis as unknown as Record<string, unknown>)[DIAGNOSTICS_GLOBAL_KEY] = diagnostics;
