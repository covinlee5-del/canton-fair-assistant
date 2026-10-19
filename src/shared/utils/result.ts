// Result / AppError 工具

import { ErrorCode } from '../types/base';
import type { AppError, Result } from '../types/base';
import { messageFor } from '../constants/error-codes';

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function fail<E = AppError>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * 拆包：成功返回值，失败抛出 AppError。
 * 用于命令层（SW 消息处理器）——服务层保持返回 Result，命令层转为"返回值或抛错"，
 * 由消息路由器统一包装成一层信封，避免出现 Result 套 Result。
 */
export function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  throw result.error;
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}

/** 任意异常 → AppError（已为 AppError 时原样返回） */
export function toAppError(cause: unknown): AppError {
  if (isAppError(cause)) return cause;
  const detail = cause instanceof Error ? cause.message : String(cause);
  return {
    code: ErrorCode.UNKNOWN_ERROR,
    message: messageFor(ErrorCode.UNKNOWN_ERROR),
    detail,
    cause,
  };
}

/** 按错误码构造 AppError（文案取 ERROR_MESSAGES） */
export function appError(code: ErrorCode, detail?: string, cause?: unknown): AppError {
  return { code, message: messageFor(code), detail, cause };
}

/**
 * 按错误码构造 AppError，但用更具体的业务文案覆盖默认文案。
 *
 * 用于「同一个错误码、但原因必须说清楚」的场景（如批量操作到底是哪一条不合法）。
 * 默认文案仍可通过 messageFor(code) 取得，便于回溯。
 */
export function appErrorWithMessage(
  code: ErrorCode,
  message: string,
  detail?: string,
  cause?: unknown,
): AppError {
  return { code, message, detail, cause };
}

/** 存储异常统一构造 */
export function storageError(action: string, cause: unknown): AppError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return appError(ErrorCode.STORAGE_ERROR, `${action}: ${detail}`, cause);
}
