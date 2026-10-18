// 基础类型与错误模型（docs/03 §2）

export type ID = string;
export type ISODate = string;

export enum ErrorCode {
  UNSUPPORTED_PAGE = 'UNSUPPORTED_PAGE',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  PAGE_NOT_READY = 'PAGE_NOT_READY',
  NO_VISIBLE_NOTES = 'NO_VISIBLE_NOTES',
  DOM_STRUCTURE_CHANGED = 'DOM_STRUCTURE_CHANGED',
  EXTRACTION_PARTIAL = 'EXTRACTION_PARTIAL',
  LOGIN_REQUIRED = 'LOGIN_REQUIRED',
  CAPTCHA_OR_RISK_CONTROL = 'CAPTCHA_OR_RISK_CONTROL',
  STORAGE_ERROR = 'STORAGE_ERROR',
  IMPORT_INVALID = 'IMPORT_INVALID',
  INVALID_INPUT = 'INVALID_INPUT',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface AppError {
  /** 机器可读错误码 */
  code: ErrorCode;
  /** 面向普通用户的文案 */
  message: string;
  /** 开发调试信息 */
  detail?: string;
  cause?: unknown;
}

export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };
