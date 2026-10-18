// 内容脚本与 background 之间约定的全局键名
// 内容脚本把诊断结果写入 isolated world 的该键，background 侧再读取。

export const DIAGNOSTICS_GLOBAL_KEY = '__CANTON_FAIR_LAST_DIAGNOSTICS__';
