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
