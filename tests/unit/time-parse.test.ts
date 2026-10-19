// 时间文本解析测试（阶段 3 T3.3）
// 固定 now 保证结果确定；无法识别的文本必须「保留原文且不报错」。

import { describe, expect, it } from 'vitest';
import { parseXhsTime } from '../../src/shared/utils/time';

// 2026-03-10 12:00:00 本地时间
const NOW = new Date(2026, 2, 10, 12, 0, 0);

function localDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

describe('parseXhsTime', () => {
  it('「刚刚」解析为当前时刻', () => {
    const parsed = parseXhsTime('刚刚', NOW);
    expect(parsed.kind).toBe('relative');
    expect(parsed.iso).toBe(NOW.toISOString());
  });

  it('「N分钟前」按分钟回退', () => {
    const parsed = parseXhsTime('5分钟前', NOW);
    expect(parsed.iso).toBe(new Date(2026, 2, 10, 11, 55, 0).toISOString());
    expect(parsed.dayPrecision).toBe(false);
  });

  it('「N小时前」按小时回退（跨日正确）', () => {
    const parsed = parseXhsTime('13小时前', NOW);
    expect(parsed.iso).toBe(new Date(2026, 2, 9, 23, 0, 0).toISOString());
  });

  it('「昨天」解析为前一天且只精确到日', () => {
    const parsed = parseXhsTime('昨天', NOW);
    expect(parsed.kind).toBe('relative');
    expect(parsed.dayPrecision).toBe(true);
    expect(localDate(parsed.iso)).toBe('2026-03-09');
  });

  it('「昨天 08:30」保留时分', () => {
    const parsed = parseXhsTime('昨天 08:30', NOW);
    expect(parsed.iso).toBe(new Date(2026, 2, 9, 8, 30, 0).toISOString());
    expect(parsed.dayPrecision).toBe(false);
  });

  it('「N天前」按天回退', () => {
    const parsed = parseXhsTime('3 天前', NOW);
    expect(localDate(parsed.iso)).toBe('2026-03-07');
    expect(parsed.dayPrecision).toBe(true);
  });

  it('「MM-DD」取今年', () => {
    const parsed = parseXhsTime('03-05', NOW);
    expect(parsed.kind).toBe('absolute');
    expect(localDate(parsed.iso)).toBe('2026-03-05');
  });

  it('「MM-DD」晚于当前日期时回退到上一年（跨年）', () => {
    const parsed = parseXhsTime('12-31', NOW);
    expect(localDate(parsed.iso)).toBe('2025-12-31');
  });

  it('「YYYY-MM-DD」原样解析', () => {
    const parsed = parseXhsTime('2025-11-04', NOW);
    expect(parsed.kind).toBe('absolute');
    expect(localDate(parsed.iso)).toBe('2025-11-04');
  });

  it('「YYYY-MM-DD HH:mm」保留时分', () => {
    const parsed = parseXhsTime('2025-11-04 09:15', NOW);
    expect(parsed.iso).toBe(new Date(2025, 10, 4, 9, 15, 0).toISOString());
  });

  it('去掉「编辑于」前缀后仍能解析', () => {
    const parsed = parseXhsTime('编辑于 3 天前', NOW);
    expect(localDate(parsed.iso)).toBe('2026-03-07');
    expect(parsed.raw).toBe('3 天前');
  });

  it('无法识别时保留原文、返回 null 且不抛错', () => {
    const parsed = parseXhsTime('这是一个奇怪的时间', NOW);
    expect(parsed.iso).toBeNull();
    expect(parsed.kind).toBe('unknown');
    expect(parsed.raw).toBe('这是一个奇怪的时间');
  });

  it('空值/空字符串安全返回 unknown', () => {
    expect(parseXhsTime(null, NOW).iso).toBeNull();
    expect(parseXhsTime(undefined, NOW).iso).toBeNull();
    expect(parseXhsTime('   ', NOW).kind).toBe('unknown');
  });

  it('非法日期（2 月 31 日）不被静默进位', () => {
    const parsed = parseXhsTime('2026-02-31', NOW);
    expect(parsed.iso).toBeNull();
    expect(parsed.kind).toBe('unknown');
  });
});
