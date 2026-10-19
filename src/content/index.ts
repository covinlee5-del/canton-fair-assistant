// 内容脚本入口（按需注入，IIFE 打包为 dist/content.js）
//
// 注意：打包成 IIFE 后整个文件是「变量赋值语句」，脚本完成值为空 ——
// 因此不能依赖 executeScript 的返回值拿到结果。
// 这里把结果显式写到 isolated world 的全局对象上，
// 由 background 侧二次注入自包含函数读回（见 src/platform/scripting.ts）。
//
// 阶段 3：除诊断外，同时把本次扫描提取到的笔记草稿写到第二个全局键。
// 仍然只读：不滚动、不翻页、不点击、不写页面。

import { createXiaohongshuAdapter } from './adapters/xiaohongshu-adapter';
import {
  DIAGNOSTICS_GLOBAL_KEY,
  NOTES_GLOBAL_KEY,
} from '../shared/constants/content-globals';

const adapter = createXiaohongshuAdapter(window.location.href, document);
const diagnostics = adapter.getExtractionDiagnostics();
const notes = adapter.extractVisibleNotes();

const globals = globalThis as unknown as Record<string, unknown>;
globals[DIAGNOSTICS_GLOBAL_KEY] = diagnostics;
globals[NOTES_GLOBAL_KEY] = notes;
