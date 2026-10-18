// URL 解析与笔记链接规范化（docs/03 §10 去重规则第 1–2 条）
// 纯函数，可在 Node/浏览器/内容脚本中运行。

const XHS_HOST_RE = /(^|\.)xiaohongshu\.com$/i;
// 小红书笔记 ID 为 24 位 hex
export const NOTE_PATH_RE = /^\/(?:explore|discovery\/item)\/([a-f0-9]{24})\/?$/i;

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
 */
export function canonicalizeNoteUrl(raw: string | null | undefined): string | null {
  const parsed = parsePageUrl(raw);
  if (!parsed || !parsed.isXiaohongshu) return null;
  if (!raw) return null;
  const id = extractNoteId(raw);
  if (!id) return null;
  return `https://www.xiaohongshu.com/explore/${id}`;
}
