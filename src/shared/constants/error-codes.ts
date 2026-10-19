// 错误码 → 面向用户文案（docs/04 §5）

import { ErrorCode } from '../types/base';

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.UNSUPPORTED_PAGE]:
    '当前页面不是支持的小红书页面。请打开小红书搜索结果页后重试。',
  [ErrorCode.PERMISSION_DENIED]:
    '无法访问当前页面。请在目标页面上重新点击扩展图标，然后再试。',
  [ErrorCode.PAGE_NOT_READY]:
    '页面内容还没加载完成。请稍候片刻再点读取。',
  [ErrorCode.NO_VISIBLE_NOTES]:
    '当前页面没有识别到可读取的笔记。请确认你已打开小红书搜索结果页面，并等待内容加载完成后重试。',
  [ErrorCode.NOT_SEARCH_RESULTS]:
    '当前不是搜索结果页。批量读取只在搜索结果页生效——请先返回到小红书搜索结果页，再点「读取当前页面笔记」。（下方「识别卡片」显示的是页面残留的卡片数，本页不会读取。）',
  [ErrorCode.DOM_STRUCTURE_CHANGED]:
    '页面结构似乎发生了变化，暂时无法完整识别笔记。建议更新插件版本；当前数据已尽力保留。',
  [ErrorCode.EXTRACTION_PARTIAL]:
    '部分笔记的信息不完整（如缺少时间），已提取可见内容。',
  [ErrorCode.LOGIN_REQUIRED]:
    '检测到需要登录才能查看内容。请先在小红书登录自己的账号，然后重试。',
  [ErrorCode.CAPTCHA_OR_RISK_CONTROL]:
    '检测到验证提示。请在小红书页面手动完成验证后再读取；本插件不会绕过验证。',
  [ErrorCode.STORAGE_ERROR]:
    '保存数据失败。请检查浏览器磁盘空间后重试；本次读取结果尚未保存。',
  [ErrorCode.IMPORT_INVALID]:
    '导入文件格式不正确或不兼容。已拒绝导入，原有数据未受影响。',
  [ErrorCode.INVALID_INPUT]:
    '输入内容不合法，请检查后重试。',
  [ErrorCode.UNKNOWN_ERROR]:
    '发生未知错误。请重试；若持续出现，请导出诊断信息反馈。',
};

export function messageFor(code: ErrorCode): string {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES[ErrorCode.UNKNOWN_ERROR];
}
