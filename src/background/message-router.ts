// 消息路由器：注册 → 分发 → 统一包装 Result 信封（docs/02 §7）
// 注意：MV3 SW 可能随时被终止，处理器必须是幂等/持久化的，不依赖内存状态。

import type { MessageName } from '../messaging/messages';
import { toAppError } from '../shared/utils/result';

type MessageHandler = (payload: unknown) => Promise<unknown> | unknown;

const handlers = new Map<MessageName, MessageHandler>();

export function register(name: MessageName, handler: MessageHandler): void {
  handlers.set(name, handler);
}

interface RawMessage {
  name?: unknown;
  payload?: unknown;
}

export function initMessageRouter(): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    const raw = message as RawMessage | null | undefined;
    const name = raw?.name;
    if (typeof name !== 'string') return false;
    const handler = handlers.get(name as MessageName);
    if (!handler) return false;
    Promise.resolve()
      .then(() => handler(raw?.payload))
      .then(
        (value) => {
          sendResponse({ ok: true, value });
        },
        (cause: unknown) => {
          sendResponse({ ok: false, error: toAppError(cause) });
        },
      );
    // 返回 true 表示异步 sendResponse（MV3 要求）
    return true;
  });
}
