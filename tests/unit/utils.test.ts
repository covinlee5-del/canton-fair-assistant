import { describe, expect, it } from 'vitest';
import {
  dedupeCaseInsensitive,
  normalizeText,
  truncateText,
} from '../../src/shared/utils/text';
import { appError, isAppError, ok, toAppError } from '../../src/shared/utils/result';
import { formatDateTime } from '../../src/shared/utils/time';
import { ErrorCode } from '../../src/shared/types/base';
import { ERROR_MESSAGES } from '../../src/shared/constants/error-codes';

describe('文本工具', () => {
  it('normalizeText 折叠空白并去除首尾空格', () => {
    expect(normalizeText('  广交会 \n 翻译  ')).toBe('广交会 翻译');
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });

  it('truncateText 超长截断并加省略号', () => {
    const long = 'a'.repeat(30);
    const out = truncateText(long, 10);
    expect(out.length).toBe(10);
    expect(out.endsWith('…')).toBe(true);
    expect(truncateText('short', 10)).toBe('short');
  });

  it('dedupeCaseInsensitive 大小写不敏感去重且保留顺序', () => {
    expect(dedupeCaseInsensitive(['Canton', 'canton', 'Fair'])).toEqual(['Canton', 'Fair']);
  });
});

describe('Result 工具', () => {
  it('ok 包装成功值', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
  });

  it('appError 使用统一用户文案', () => {
    const err = appError(ErrorCode.PERMISSION_DENIED, 'detail');
    expect(err.code).toBe(ErrorCode.PERMISSION_DENIED);
    expect(err.message).toBe(ERROR_MESSAGES[ErrorCode.PERMISSION_DENIED]);
    expect(err.detail).toBe('detail');
  });

  it('toAppError 保留已是 AppError 的输入', () => {
    const original = appError(ErrorCode.STORAGE_ERROR, 'x');
    expect(toAppError(original)).toBe(original);
  });

  it('toAppError 把普通异常包装为 UNKNOWN_ERROR 且保留调试信息', () => {
    const wrapped = toAppError(new Error('boom'));
    expect(wrapped.code).toBe(ErrorCode.UNKNOWN_ERROR);
    expect(wrapped.detail).toBe('boom');
    expect(isAppError(wrapped)).toBe(true);
  });
});

describe('时间工具', () => {
  it('formatDateTime 空值显示占位符', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
  });

  it('formatDateTime 格式化本地时间', () => {
    const iso = '2026-03-05T08:07:00.000Z';
    expect(formatDateTime(iso)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});
