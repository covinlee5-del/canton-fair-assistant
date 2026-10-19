// URL 解析与笔记链接规范化（docs/03 §10 去重规则第 1–3 条）
// 纯函数，可在 Node/浏览器/内容脚本中运行。

import { fingerprintOf } from '../utils/hash';

const XHS_HOST_RE = /(^|\.)xiaohongshu\.com$/i;
// 小红书笔记 ID 为 24 位 hex。
// 搜索结果页卡片的链接实测是 /search_result/{id}，详情页是 /explore/{id}，
// 三者的 ID 是同一个，因此都要能解析出来（否则卡片链接会被整张跳过，连带丢掉 xsec_token）。
export const NOTE_PATH_RE =
  /^\/(?:explore|discovery\/item|search_result)\/([a-f0-9]{24})\/?$/i;

export interface ParsedPageUrl {
  host: string | null;
  pathname: string;
  isXiaohongshu: boolean;
}

export function parsePageUrl(url: string | null | undefined): ParsedPageUrl | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return {
      host,
      pathname: u.pathname,
      isXiaohongshu: XHS_HOST_RE.test(host),
    };
  } catch {
    return null;
  }
}

/** 隐私安全 URL：仅 origin 的主机名 + pathname，丢弃全部查询参数 */
export function toPrivacySafePageUrl(url: string | null | undefined): string | null {
  const parsed = parsePageUrl(url);
  if (!parsed) return null;
  return `${parsed.host}${parsed.pathname}`;
}

/** 从笔记链接提取笔记 ID（24 位 hex），失败返回 null */
export function extractNoteId(url: string): string | null {
  const parsed = parsePageUrl(url);
  if (!parsed) return null;
  const match = parsed.pathname.match(NOTE_PATH_RE);
  return match?.[1] ? match[1].toLowerCase() : null;
}

/**
 * 规范化笔记链接：https://www.xiaohongshu.com/explore/{id}，丢弃全部查询参数。
 * 非小红书链接或无法提取 ID 时返回 null（走指纹兜底）。
 *
 * ⚠️ 这个链接**只用于去重与展示**，不能直接拿去打开：
 * 小红书需要 `xsec_token` 授权才能在不登录的情况下查看笔记，
 * 丢掉 query 后新开标签页会跳到「请打开小红书App扫码查看」。打开请用 buildNoteOpenUrl()。
 */
export function canonicalizeNoteUrl(raw: string | null | undefined): string | null {
  const parsed = parsePageUrl(raw);
  if (!parsed || !parsed.isXiaohongshu) return null;
  if (!raw) return null;
  const id = extractNoteId(raw);
  if (!id) return null;
  return `https://www.xiaohongshu.com/explore/${id}`;
}

/**
 * 打开笔记用的链接：**保留页面原始路径**与授权参数，丢弃追踪参数。
 *
 * 三条硬约束（均由 2026-10-19 真实页面实测得出，改动前务必先读）：
 * 1. 路径必须原样保留。实测搜索卡片用的是 `/search_result/{id}?xsec_token=…`，
 *    强行改写成 `/explore/{id}` 会改变被签名的 URL，服务端校验失败。
 * 2. 只放行白名单参数（`xsec_token` / `xsec_source`），其余 `utm_*`、`share_*`、`referer` 一律丢弃。
 * 3. 参数值必须**原样保留编码**。实测 token 形如 `ABt8...EU0=`，末尾带 `=`；
 *    用 URLSearchParams 重建会转义成 `%3D`，打开后返回 `error_code=300031 当前笔记暂时无法浏览`。
 *
 * 这些 token 是「笔记公开分享链接的一部分」，不是账号凭证；仅存本地、仅用于你自己点开的标签页。
 */
const NOTE_OPEN_QUERY_WHITELIST: readonly string[] = ['xsec_token', 'xsec_source'];

export function buildNoteOpenUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parsed = parsePageUrl(raw);
  if (!parsed || !parsed.isXiaohongshu) return null;
  if (!extractNoteId(raw)) return null;

  let source: URL;
  try {
    source = new URL(raw);
  } catch {
    return null;
  }

  const rawQuery = source.search.startsWith('?') ? source.search.slice(1) : source.search;
  const kept: string[] = [];
  for (const segment of rawQuery.split('&')) {
    if (segment.length === 0) continue;
    const eq = segment.indexOf('=');
    const keyRaw = eq === -1 ? segment : segment.slice(0, eq);
    const valueRaw = eq === -1 ? '' : segment.slice(eq + 1);
    if (valueRaw.length === 0) continue; // 空值（实测 `xsec_source=` 常为空）没有作用
    let key: string;
    try {
      key = decodeURIComponent(keyRaw);
    } catch {
      key = keyRaw;
    }
    // 原样拼回，不重新编码值：保住 token 末尾的 '='
    if (NOTE_OPEN_QUERY_WHITELIST.includes(key)) kept.push(segment);
  }

  const path = source.pathname; // 原样保留，不做 /explore 改写
  const query = kept.join('&');
  return query.length > 0
    ? `https://www.xiaohongshu.com${path}?${query}`
    : `https://www.xiaohongshu.com${path}`;
}

/** 去重键类型（docs/03 §10） */
export type DedupeKeyType = 'url' | 'fingerprint';

export interface DedupeKeyResult {
  key: string;
  type: DedupeKeyType;
}

/**
 * 计算去重键（docs/03 §10 第 1–3 条）：
 * 1) 能解析出笔记 ID → `url:{id}`，全局唯一；
 * 2) 否则 → `fp:{hash(规范化标题|作者显示名)}`，标题与作者都为空时返回 null。
 *
 * 注意：标题相似不算同一条，只有规范化后完全一致 + 作者一致才视为同一候选。
 */
export function computeDedupeKey(input: {
  canonicalUrl?: string | null;
  url?: string | null;
  title?: string | null;
  authorDisplayName?: string | null;
}): DedupeKeyResult | null {
  const id =
    extractNoteId(input.canonicalUrl ?? '') ?? extractNoteId(input.url ?? '') ?? null;
  if (id) return { key: `url:${id}`, type: 'url' };

  const title = (input.title ?? '').trim();
  const author = (input.authorDisplayName ?? '').trim();
  if (title.length === 0 && author.length === 0) return null;
  return { key: fingerprintOf([title, author]), type: 'fingerprint' };
}
