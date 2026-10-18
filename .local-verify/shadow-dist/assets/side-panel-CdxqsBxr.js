// 消息契约（docs/02 §7）
// 所有消息经 chrome.runtime.sendMessage，响应统一为 MessageEnvelope（Result 语义）。
const Message = {
    READ_PAGE: 'read-page',
    GET_DASHBOARD: 'get-dashboard',
    TASK_LIST: 'task.list',
    TASK_CREATE: 'task.create',
    TASK_UPDATE: 'task.update',
    TASK_DELETE: 'task.delete',
    TASK_DUPLICATE: 'task.duplicate',
    TASK_SET_STATUS: 'task.set-status',
    SETTINGS_GET: 'settings.get',
    SETTINGS_SET_DEFAULT_TASK: 'settings.set-default-task',
};

// 基础类型与错误模型（docs/03 §2）
var ErrorCode;
(function (ErrorCode) {
    ErrorCode["UNSUPPORTED_PAGE"] = "UNSUPPORTED_PAGE";
    ErrorCode["PERMISSION_DENIED"] = "PERMISSION_DENIED";
    ErrorCode["PAGE_NOT_READY"] = "PAGE_NOT_READY";
    ErrorCode["NO_VISIBLE_NOTES"] = "NO_VISIBLE_NOTES";
    ErrorCode["DOM_STRUCTURE_CHANGED"] = "DOM_STRUCTURE_CHANGED";
    ErrorCode["EXTRACTION_PARTIAL"] = "EXTRACTION_PARTIAL";
    ErrorCode["LOGIN_REQUIRED"] = "LOGIN_REQUIRED";
    ErrorCode["CAPTCHA_OR_RISK_CONTROL"] = "CAPTCHA_OR_RISK_CONTROL";
    ErrorCode["STORAGE_ERROR"] = "STORAGE_ERROR";
    ErrorCode["IMPORT_INVALID"] = "IMPORT_INVALID";
    ErrorCode["INVALID_INPUT"] = "INVALID_INPUT";
    ErrorCode["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
})(ErrorCode || (ErrorCode = {}));

// 错误码 → 面向用户文案（docs/04 §5）
const ERROR_MESSAGES = {
    [ErrorCode.UNSUPPORTED_PAGE]: '当前页面不是支持的小红书页面。请打开小红书搜索结果页后重试。',
    [ErrorCode.PERMISSION_DENIED]: '无法访问当前页面。请在目标页面上重新点击扩展图标，然后再试。',
    [ErrorCode.PAGE_NOT_READY]: '页面内容还没加载完成。请稍候片刻再点读取。',
    [ErrorCode.NO_VISIBLE_NOTES]: '当前页面没有识别到可读取的笔记。请确认你已打开小红书搜索结果页面，并等待内容加载完成后重试。',
    [ErrorCode.DOM_STRUCTURE_CHANGED]: '页面结构似乎发生了变化，暂时无法完整识别笔记。建议更新插件版本；当前数据已尽力保留。',
    [ErrorCode.EXTRACTION_PARTIAL]: '部分笔记的信息不完整（如缺少时间），已提取可见内容。',
    [ErrorCode.LOGIN_REQUIRED]: '检测到需要登录才能查看内容。请先在小红书登录自己的账号，然后重试。',
    [ErrorCode.CAPTCHA_OR_RISK_CONTROL]: '检测到验证提示。请在小红书页面手动完成验证后再读取；本插件不会绕过验证。',
    [ErrorCode.STORAGE_ERROR]: '保存数据失败。请检查浏览器磁盘空间后重试；本次读取结果尚未保存。',
    [ErrorCode.IMPORT_INVALID]: '导入文件格式不正确或不兼容。已拒绝导入，原有数据未受影响。',
    [ErrorCode.INVALID_INPUT]: '输入内容不合法，请检查后重试。',
    [ErrorCode.UNKNOWN_ERROR]: '发生未知错误。请重试；若持续出现，请导出诊断信息反馈。',
};
function messageFor(code) {
    return ERROR_MESSAGES[code] ?? ERROR_MESSAGES[ErrorCode.UNKNOWN_ERROR];
}

// Result / AppError 工具
function ok(value) {
    return { ok: true, value };
}
function fail(error) {
    return { ok: false, error };
}
/**
 * 拆包：成功返回值，失败抛出 AppError。
 * 用于命令层（SW 消息处理器）——服务层保持返回 Result，命令层转为"返回值或抛错"，
 * 由消息路由器统一包装成一层信封，避免出现 Result 套 Result。
 */
function unwrap(result) {
    if (result.ok)
        return result.value;
    throw result.error;
}
function isAppError(value) {
    return (typeof value === 'object' &&
        value !== null &&
        'code' in value &&
        'message' in value &&
        typeof value.message === 'string');
}
/** 任意异常 → AppError（已为 AppError 时原样返回） */
function toAppError(cause) {
    if (isAppError(cause))
        return cause;
    const detail = cause instanceof Error ? cause.message : String(cause);
    return {
        code: ErrorCode.UNKNOWN_ERROR,
        message: messageFor(ErrorCode.UNKNOWN_ERROR),
        detail,
        cause,
    };
}
/** 按错误码构造 AppError（文案取 ERROR_MESSAGES） */
function appError(code, detail, cause) {
    return { code, message: messageFor(code), detail, cause };
}
/** 存储异常统一构造 */
function storageError(action, cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return appError(ErrorCode.STORAGE_ERROR, `${action}: ${detail}`, cause);
}

// 任务模型（docs/03 §3）
var TaskCategory;
(function (TaskCategory) {
    TaskCategory["CANTON_FAIR"] = "CANTON_FAIR";
    TaskCategory["FOREIGN_BUYER"] = "FOREIGN_BUYER";
    TaskCategory["INTERPRETER"] = "INTERPRETER";
    TaskCategory["EXHIBITION_COMPANION"] = "EXHIBITION_COMPANION";
    TaskCategory["BUSINESS_RECEPTION"] = "BUSINESS_RECEPTION";
    TaskCategory["OTHER"] = "OTHER";
})(TaskCategory || (TaskCategory = {}));

// 时间工具
function nowIso() {
    return new Date().toISOString();
}
/** 本地时区格式化展示：YYYY-MM-DD HH:mm；空值显示 “—” */
function formatDateTime(iso) {
    if (!iso)
        return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return String(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Side Panel 与扩展页面辅助
function isSidePanelSupported() {
    return typeof chrome.sidePanel !== 'undefined' && chrome.sidePanel != null;
}
async function openOptionsPage() {
    await chrome.runtime.openOptionsPage();
}
function extensionVersion() {
    return chrome.runtime.getManifest().version;
}

export { ErrorCode as E, Message as M, TaskCategory as T, appError as a, ok as b, fail as c, extensionVersion as e, formatDateTime as f, isSidePanelSupported as i, nowIso as n, openOptionsPage as o, storageError as s, toAppError as t, unwrap as u };
