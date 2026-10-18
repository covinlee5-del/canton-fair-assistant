// 文本规范化工具

/** trim + 折叠连续空白为单个空格；null/undefined → '' */
export function normalizeText(input: string | null | undefined): string {
  if (input == null) return '';
  return input.replace(/\s+/g, ' ').trim();
}

/** 超出长度截断并加省略号 */
export function truncateText(input: string, maxLength: number): string {
  const text = normalizeText(input);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

/** 大小写不敏感去重（保留首次出现顺序与原文） */
export function dedupeCaseInsensitive(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
