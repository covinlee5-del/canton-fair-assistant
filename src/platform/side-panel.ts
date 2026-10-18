// Side Panel 与扩展页面辅助

export function isSidePanelSupported(): boolean {
  return typeof chrome.sidePanel !== 'undefined' && chrome.sidePanel != null;
}

export async function openOptionsPage(): Promise<void> {
  await chrome.runtime.openOptionsPage();
}

export function extensionVersion(): string {
  return chrome.runtime.getManifest().version;
}
