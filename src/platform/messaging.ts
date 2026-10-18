// 消息发送端（UI 使用）

import type { MessageEnvelope } from '../messaging/messages';

export async function sendMessage<T>(
  name: string,
  payload: unknown,
): Promise<MessageEnvelope<T>> {
  return (await chrome.runtime.sendMessage({ name, payload })) as MessageEnvelope<T>;
}
