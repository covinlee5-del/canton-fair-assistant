// 选择器注册表（集中管理、带版本号；docs/02 §5、docs/04 §4、docs/10 对照表）
//
// 设计约束（阶段 3 §3）：
//   1) 全仓库只允许在本文件出现 DOM 选择器字符串；
//   2) 每条规则都带「来源」标注，说明它来自哪一次实测/推断，便于回溯；
//   3) 每条规则都是「有序候选列表」而不是单条选择器 —— 平台改版时按顺序降级，
//      不会因为某一个 class 改名就整页提取失败；
//   4) 平台改版导致全部候选都命中 0 时，由 diagnostics 报 DOM_STRUCTURE_CHANGED，
//      绝不静默返回空列表（见 src/content/diagnostics.ts）。
//
// 版本历史：
//   probe-0.1.0  阶段 2 探针版：只统计结构信号，不读任何文本。
//   xhs-1.0.0    阶段 3 正式提取版：新增卡片内字段（标题/链接/作者/摘要/时间）
//                与登录墙/验证码信号。来源见 SELECTOR_MAP 的 source 字段。

import type { PageSignals } from '../../shared/types/extraction';
import { normalizeText } from '../../shared/utils/text';

export const SELECTOR_VERSION = 'xhs-1.0.0';

/** 单次扫描的卡片上限（阶段 3 §3 第 5 条：超出部分提示滚动后再次读取） */
export const MAX_CARDS_PER_SCAN = 300;

/** 字段长度上限（阶段 3 §3 第 6 条：防止数据库膨胀） */
export const MAX_TITLE_LENGTH = 120;
export const MAX_SNIPPET_LENGTH = 200;

/**
 * 选择器来源标注：
 * - measured：真实页面实测确认（docs/verification-results.md §6 有对应信号）
 * - inferred：由实测结构信号 + 小红书公开页面结构推断，需 T3.10 真实复验确认
 * - fallback：兜底规则，命中即用，不承诺稳定
 */
export type SelectorSource = 'measured' | 'inferred' | 'fallback';

export interface SelectorRule {
  /** 字段名，与 docs/10 对照表一致 */
  field: string;
  /** 有序候选选择器：前面的优先 */
  selectors: readonly string[];
  source: SelectorSource;
  /** 该规则依据的实测证据或推断理由 */
  evidence: string;
}

/**
 * 卡片容器。
 * measured：`section.note-item` 在真实搜索结果页存在，且随滚动从 22 增长到 30
 * （verification-results.md §6 第 4、5 步）。
 */
export const CARD_RULE: SelectorRule = {
  field: 'card',
  selectors: ['section.note-item', 'div.note-item', 'section[class*="note-item"]'],
  source: 'measured',
  evidence: '§6 第 4/5 步：section.note-item 命中 22→30，随滚动增量追加',
};

/**
 * 卡片内笔记链接。
 * measured：`a[href*="/explore/"]` 去重计数在真实页面可用（20/30/28/60）。
 * 取链接时必须从「卡片自身节点」内取，绝不跨节点拼接（阶段 3 §4 风险表）。
 */
export const LINK_RULE: SelectorRule = {
  field: 'link',
  selectors: [
    'a.cover[href]',
    'a[href*="/explore/"]',
    'a[href*="/discovery/item/"]',
    'a[href]',
  ],
  source: 'measured',
  evidence: '§6 第 4–6 步：/explore/ 链接去重计数稳定；前两条为封面链接优先',
};

/** 标题：优先 footer 内的标题文本，其次链接自身的 title/aria-label，最后图片 alt */
export const TITLE_RULE: SelectorRule = {
  field: 'title',
  selectors: ['.footer .title span', '.footer .title', 'a.title span', 'a.title', '.title span', '.title'],
  source: 'inferred',
  evidence: '结构信号未采集到字段级路径；依据卡片内 footer/title 常见结构推断，待 T3.10 复验',
};

/** 作者显示名：只取页面可见显示名，不推断身份 */
export const AUTHOR_RULE: SelectorRule = {
  field: 'author',
  selectors: [
    '.footer .author .name',
    '.author-wrapper .name',
    '.author .name',
    '.user-name',
    '.name',
  ],
  source: 'inferred',
  evidence: '同上；仅取可见显示名，缺失时留空而不猜测',
};

/** 发布时间文本（原文保留，解析见 shared/utils/time.ts parseXhsTime） */
export const TIME_RULE: SelectorRule = {
  field: 'time',
  selectors: ['.footer .author .time', '.author .time', '.bottom-container .time', '.time'],
  source: 'inferred',
  evidence: '阶段 3 §7 第 2 项（真实时间文本格式）尚未采集，本规则需 T3.10 复验',
};

/** 摘要：搜索结果卡片常常没有摘要，缺失属正常，不计入质量降级 */
export const SNIPPET_RULE: SelectorRule = {
  field: 'snippet',
  selectors: ['.footer .desc', '.note-desc', '.desc', '.summary'],
  source: 'inferred',
  evidence: '搜索卡片多数无摘要，仅作可选字段',
};

/** 登录墙信号（只检测 + 提示，绝不绕过；阶段 3 §3 第 3 条） */
export const LOGIN_WALL_RULE: SelectorRule = {
  field: 'loginWall',
  selectors: [
    '.login-container',
    '.login-modal',
    '#login-modal',
    '.qrcode-login',
    '.login-box',
  ],
  source: 'inferred',
  evidence: '§6 第 9 步无法区分登录态（观察 C），此规则待 T3.10 用未登录页面复验',
};

/** 验证码/风控信号（只检测 + 提示，绝不绕过） */
export const CAPTCHA_RULE: SelectorRule = {
  field: 'captcha',
  selectors: [
    '[class*="captcha"]',
    '#captcha',
    '.red-captcha',
    '[class*="verify-container"]',
    '[class*="slider-verify"]',
  ],
  source: 'inferred',
  evidence: '§6 第 10 步未触发验证码，规则待真实场景复验',
};

/** 典型 SPA 挂载点（仅用于诊断） */
export const APP_SHELL_SELECTOR = '#app, #root';
/** 搜索结果常见容器（仅用于诊断） */
export const RESULT_CONTAINER_SELECTOR = 'div.feeds-container';

/** 全部规则，供 docs/10 对照表与测试遍历 */
export const SELECTOR_MAP: readonly SelectorRule[] = [
  CARD_RULE,
  LINK_RULE,
  TITLE_RULE,
  AUTHOR_RULE,
  TIME_RULE,
  SNIPPET_RULE,
  LOGIN_WALL_RULE,
  CAPTCHA_RULE,
];

/** 遍历候选选择器，返回第一个命中的元素 */
export function queryFirst(root: Element | Document, selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    let found: Element | null = null;
    try {
      found = root.querySelector(selector);
    } catch {
      // 选择器语法在当前浏览器不被支持时跳过该候选，继续降级
      continue;
    }
    if (found) return found;
  }
  return null;
}

/** 遍历候选选择器，返回第一个「文本非空」的命中元素 */
export function queryFirstWithText(
  root: Element | Document,
  selectors: readonly string[],
): { element: Element; text: string } | null {
  for (const selector of selectors) {
    let nodes: Element[] = [];
    try {
      nodes = Array.from(root.querySelectorAll(selector));
    } catch {
      continue;
    }
    for (const node of nodes) {
      const text = normalizeText(node.textContent);
      if (text.length > 0) return { element: node, text };
    }
  }
  return null;
}

/**
 * 收集页面上的笔记卡片。
 * - 多个卡片选择器可能命中同一元素：用 Set 去重；
 * - 命中嵌套元素（如 section.note-item 内再套 note-item）：只保留最外层；
 * - 按文档顺序排序，保证列表顺序与页面一致。
 */
export function collectNoteCards(doc: Document): Element[] {
  const seen = new Set<Element>();
  for (const selector of CARD_RULE.selectors) {
    let nodes: Element[] = [];
    try {
      nodes = Array.from(doc.querySelectorAll(selector));
    } catch {
      continue;
    }
    for (const node of nodes) seen.add(node);
  }
  const all = Array.from(seen);
  const outermost = all.filter(
    (el) => !all.some((other) => other !== el && other.contains(el)),
  );
  return outermost.sort((a, b) =>
    a.compareDocumentPosition(b) & 4 /* DOCUMENT_POSITION_FOLLOWING */ ? -1 : 1,
  );
}

/**
 * 在卡片自身节点内查找第一个能解析出笔记 ID 的链接（绝不跨节点）。
 *
 * 同一条笔记在卡片里可能有多个链接：封面链到 `/search_result/{id}?xsec_token=…`（带授权参数），
 * 标题链到不带参数的 `/explore/{id}`。必须优先取带 `xsec_token` 的那个，
 * 否则打开新标签页会落到「当前笔记暂时无法浏览 / 请扫码查看」。
 */
export function findNoteLink(
  card: Element,
  resolveNoteId: (href: string) => string | null,
): HTMLAnchorElement | null {
  const anchors = Array.from(card.querySelectorAll<HTMLAnchorElement>(LINK_RULE.selectors.join(',')));
  const candidates: HTMLAnchorElement[] =
    anchors.length > 0
      ? anchors
      : Array.from(card.querySelectorAll<HTMLAnchorElement>('a[href]'));
  let firstResolved: HTMLAnchorElement | null = null;
  for (const anchor of candidates) {
    const href = anchor.getAttribute('href');
    if (!href) continue;
    // 相对链接按页面基准补全
    const absolute = toAbsoluteUrl(href);
    if (!absolute || !resolveNoteId(absolute)) continue;
    if (/[?&]xsec_token=[^&]+/.test(absolute)) return anchor; // 带授权参数，最优
    firstResolved ??= anchor;
  }
  return firstResolved;
}

/** 把卡片内的相对 href 补全为绝对 URL（无 baseURI 时按小红书主域补全） */
export function toAbsoluteUrl(href: string): string | null {
  const trimmed = href.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  try {
    if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed).href;
    if (trimmed.startsWith('/')) return new URL(trimmed, 'https://www.xiaohongshu.com').href;
  } catch {
    return null;
  }
  return null;
}

/** 检测登录墙（只检测，不绕过） */
export function detectLoginWall(doc: Document): boolean {
  return queryFirst(doc, LOGIN_WALL_RULE.selectors) != null;
}

/** 检测验证码/风控（只检测，不绕过） */
export function detectCaptcha(doc: Document): boolean {
  return queryFirst(doc, CAPTCHA_RULE.selectors) != null;
}

/** 结构信号统计（阶段 2 起一直沿用；阶段 3 起卡片数改用卡片选择器并集） */
export function collectSignals(doc: Document): PageSignals {
  const links = Array.from(doc.querySelectorAll<HTMLAnchorElement>(LINK_RULE.selectors.join(',')));
  const uniqueHrefs = new Set<string>();
  for (const link of links) {
    const href = link.getAttribute('href');
    const absolute = href ? toAbsoluteUrl(href) : null;
    if (absolute) uniqueHrefs.add(absolute);
  }
  return {
    noteSections: collectNoteCards(doc).length,
    exploreLinks: links.length,
    uniqueNoteLinks: uniqueHrefs.size,
    resultContainers: doc.querySelectorAll(RESULT_CONTAINER_SELECTOR).length,
    appShellRendered: doc.querySelector(APP_SHELL_SELECTOR) != null,
    readyState: doc.readyState,
    loginWallDetected: detectLoginWall(doc),
    captchaDetected: detectCaptcha(doc),
  };
}
