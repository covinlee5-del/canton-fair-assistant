// tabs API 薄封装

export async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

/**
 * 在新标签页打开链接（仅由用户点击触发，不自动打开）。
 * 打开笔记是用户主动行为，不产生任何自动操作。
 */
export async function openTab(url: string): Promise<void> {
  await chrome.tabs.create({ url, active: true });
}
