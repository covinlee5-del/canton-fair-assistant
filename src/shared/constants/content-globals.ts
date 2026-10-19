// 内容脚本与 background 之间约定的全局键名
// 内容脚本把结果写入 isolated world 的这两个键，background 侧再读取。

export const DIAGNOSTICS_GLOBAL_KEY = '__CANTON_FAIR_LAST_DIAGNOSTICS__';
/** 阶段 3：本次扫描提取到的笔记草稿（NoteDraft[]） */
export const NOTES_GLOBAL_KEY = '__CANTON_FAIR_LAST_NOTES__';
