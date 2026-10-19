// 稳定短哈希（用于笔记指纹去重；非加密用途）
// 纯同步实现：内容脚本 / SW / Node 测试环境都可用，不依赖 crypto.subtle（异步且需 https）。

/**
 * FNV-1a 32 位哈希 + 长度后缀。
 * 用途仅为「同一标题+作者」的稳定标识，不作为安全哈希。
 */
export function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619，用移位避免超出 32 位精度
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** 指纹：`fp:{hash}`，hash 由传入片段按顺序拼接后计算 */
export function fingerprintOf(parts: Array<string | null | undefined>): string {
  const normalized = parts.map((p) => (p ?? '').trim().toLocaleLowerCase()).join('|');
  return `fp:${fnv1aHex(normalized)}`;
}
