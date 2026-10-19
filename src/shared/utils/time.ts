// 时间工具

import type { ISODate } from '../types/base';

export function nowIso(): ISODate {
  return new Date().toISOString();
}

export function isValidIso(value: unknown): value is ISODate {
  if (typeof value !== 'string' || value.length === 0) return false;
  return !Number.isNaN(Date.parse(value));
}

/** 本地时区格式化展示：YYYY-MM-DD HH:mm；空值显示 “—” */
export function formatDateTime(iso: ISODate | string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 本地时区格式化日期：YYYY-MM-DD；空值显示 “—” */
export function formatDate(iso: ISODate | string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 发布时间解析结果的类型 */
export type XhsTimeKind = 'relative' | 'absolute' | 'unknown';

export interface ParsedXhsTime {
  /** 解析成功为 ISO 时间；无法识别时为 null（保留原文，绝不猜） */
  iso: ISODate | null;
  /** 页面原文（规范化空白后） */
  raw: string | null;
  kind: XhsTimeKind;
  /** 是否只精确到「日」（MM-DD / N天前 / 昨天），UI 可据此只显示日期 */
  dayPrecision: boolean;
}

const UNKNOWN: ParsedXhsTime = { iso: null, raw: null, kind: 'unknown', dayPrecision: false };

/** 去掉「编辑于」「发布于」「更新于」等前缀与首尾空白 */
function stripTimePrefix(text: string): string {
  return text
    .replace(/^(编辑于|发布于|更新于|发表于)\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 解析小红书页面可见的发布时间文本（阶段 3 T3.3）。
 *
 * 覆盖：`刚刚`、`N秒前`、`N分钟前`、`N小时前`、`昨天[ HH:mm]`、`前天`、
 * `N天前`、`MM-DD[ HH:mm]`、`YYYY-MM-DD[ HH:mm]`、`YYYY/MM/DD`。
 *
 * 约定：
 * - 无法识别 → `iso=null`、`kind='unknown'`，**保留原文且不抛错**；
 * - 相对时间基于传入的 `now`（默认当前时刻），便于测试确定性；
 * - `MM-DD` 不带年份时取「今年」；若算出来晚于 now（跨年场景），回退到上一年；
 * - 只精确到日的文本，时间部分取本地 00:00，并置 `dayPrecision=true`。
 */
export function parseXhsTime(
  input: string | null | undefined,
  now: Date = new Date(),
): ParsedXhsTime {
  if (input == null) return UNKNOWN;
  const raw = stripTimePrefix(input);
  if (raw.length === 0) return UNKNOWN;

  const base = new Date(now.getTime());
  const mk = (d: Date, kind: XhsTimeKind, dayPrecision: boolean): ParsedXhsTime => ({
    iso: Number.isNaN(d.getTime()) ? null : d.toISOString(),
    raw,
    kind: Number.isNaN(d.getTime()) ? 'unknown' : kind,
    dayPrecision,
  });

  // 刚刚
  if (/^刚刚(发布)?$/.test(raw)) return mk(base, 'relative', false);

  // N秒前 / N分钟前 / N小时前
  const rel = raw.match(/^(\d+)\s*(秒|分钟|分|小时|天|周|月)前$/);
  if (rel) {
    const amount = Number(rel[1]);
    const unit = rel[2];
    if (!Number.isFinite(amount)) return UNKNOWN;
    const d = new Date(base.getTime());
    switch (unit) {
      case '秒':
        d.setSeconds(d.getSeconds() - amount);
        return mk(d, 'relative', false);
      case '分钟':
      case '分':
        d.setMinutes(d.getMinutes() - amount);
        return mk(d, 'relative', false);
      case '小时':
        d.setHours(d.getHours() - amount);
        return mk(d, 'relative', false);
      case '天':
        d.setDate(d.getDate() - amount);
        return mk(d, 'relative', true);
      case '周':
        d.setDate(d.getDate() - amount * 7);
        return mk(d, 'relative', true);
      case '月':
        d.setMonth(d.getMonth() - amount);
        return mk(d, 'relative', true);
      default:
        return UNKNOWN;
    }
  }

  // 昨天 / 前天（可带 HH:mm）
  const named = raw.match(/^(昨天|前天|今天)(?:\s*(\d{1,2}):(\d{2}))?$/);
  if (named) {
    const offset = named[1] === '昨天' ? 1 : named[1] === '前天' ? 2 : 0;
    const d = new Date(base.getTime());
    d.setDate(d.getDate() - offset);
    if (named[2] != null && named[3] != null) {
      d.setHours(Number(named[2]), Number(named[3]), 0, 0);
      return mk(d, 'relative', false);
    }
    d.setHours(0, 0, 0, 0);
    return mk(d, 'relative', true);
  }

  // YYYY-MM-DD / YYYY/MM/DD / YYYY年MM月DD日（可带 HH:mm 或 HH:mm:ss）
  const full = raw.match(
    /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (full) {
    const [, y, mo, da, hh, mm, ss] = full;
    const d = new Date(
      Number(y),
      Number(mo) - 1,
      Number(da),
      hh != null ? Number(hh) : 0,
      mm != null ? Number(mm) : 0,
      ss != null ? Number(ss) : 0,
    );
    // 校验没有溢出（如 2026-02-31 会被 Date 静默进位）
    if (d.getFullYear() !== Number(y) || d.getMonth() !== Number(mo) - 1 || d.getDate() !== Number(da)) {
      return UNKNOWN;
    }
    return mk(d, 'absolute', hh == null);
  }

  // MM-DD（不带年份）/ MM月DD日
  const md = raw.match(/^(\d{1,2})[-/月](\d{1,2})日?(?:[ T]+(\d{1,2}):(\d{2}))?$/);
  if (md) {
    const [, mo, da, hh, mm] = md;
    const year = base.getFullYear();
    let d = new Date(
      year,
      Number(mo) - 1,
      Number(da),
      hh != null ? Number(hh) : 0,
      mm != null ? Number(mm) : 0,
    );
    if (d.getMonth() !== Number(mo) - 1 || d.getDate() !== Number(da)) return UNKNOWN;
    // 跨年：算出来的日期晚于当前时刻，说明是去年的
    if (d.getTime() > base.getTime()) {
      d = new Date(
        year - 1,
        Number(mo) - 1,
        Number(da),
        hh != null ? Number(hh) : 0,
        mm != null ? Number(mm) : 0,
      );
    }
    return mk(d, 'absolute', hh == null);
  }

  // 无法识别：保留原文，不报错
  return { iso: null, raw, kind: 'unknown', dayPrecision: false };
}
