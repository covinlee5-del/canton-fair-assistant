// 选择器注册表（集中管理、带版本号；docs/02 §5、docs/04）
// 注意：以下为“探针版”通用规则（仅统计结构信号，不读取任何文本内容）。
// 正式提取选择器将在阶段 3 依据真实页面实测结果（verification-results.md）确定。

import type { PageSignals } from '../../shared/types/extraction';

export const SELECTOR_VERSION = 'probe-0.1.0';

/** 笔记链接候选：小红书笔记链接路径特征 */
export const NOTE_LINK_SELECTOR = 'a[href*="/explore/"], a[href*="/discovery/item/"]';
/** 常见笔记卡片容器（可能随平台版本变化，仅用于统计） */
export const NOTE_SECTION_SELECTOR = 'section.note-item';
/** 搜索结果常见容器（可能随平台版本变化，仅用于统计） */
export const RESULT_CONTAINER_SELECTOR = 'div.feeds-container';
/** 典型 SPA 挂载点 */
export const APP_SHELL_SELECTOR = '#app, #root';

export function collectSignals(doc: Document): PageSignals {
  const links = Array.from(
    doc.querySelectorAll<HTMLAnchorElement>(NOTE_LINK_SELECTOR),
  );
  const uniqueHrefs = new Set<string>();
  for (const link of links) {
    const href = link.href;
    if (href) uniqueHrefs.add(href);
  }
  return {
    noteSections: doc.querySelectorAll(NOTE_SECTION_SELECTOR).length,
    exploreLinks: links.length,
    uniqueNoteLinks: uniqueHrefs.size,
    resultContainers: doc.querySelectorAll(RESULT_CONTAINER_SELECTOR).length,
    appShellRendered: doc.querySelector(APP_SHELL_SELECTOR) != null,
    readyState: doc.readyState,
    // 以下两个判定依赖真实页面的信号特征，阶段 3 依据实测编码（诚实降级）
    loginWallDetected: false,
    captchaDetected: false,
  };
}
