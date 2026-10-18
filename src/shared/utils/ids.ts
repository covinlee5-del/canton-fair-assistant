// ID 生成

import type { ID } from '../types/base';

export function createId(): ID {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  // 降级：无 crypto.randomUUID 的环境（如旧浏览器）
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
