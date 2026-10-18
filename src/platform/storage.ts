// chrome.storage.local 薄封装（仅存轻量设置与诊断快照）

export async function storageGet<T>(key: string): Promise<T | null> {
  const record = await chrome.storage.local.get(key);
  const value = record[key] as T | undefined;
  return value ?? null;
}

export async function storageSet(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function storageRemove(key: string): Promise<void> {
  await chrome.storage.local.remove(key);
}
