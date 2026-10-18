(function () {
  'use strict';

  // 选择器注册表（集中管理、带版本号；docs/02 §5、docs/04）
  // 注意：以下为“探针版”通用规则（仅统计结构信号，不读取任何文本内容）。
  // 正式提取选择器将在阶段 3 依据真实页面实测结果（verification-results.md）确定。
  const SELECTOR_VERSION = 'probe-0.1.0';
  /** 笔记链接候选：小红书笔记链接路径特征 */
  const NOTE_LINK_SELECTOR = 'a[href*="/explore/"], a[href*="/discovery/item/"]';
  /** 常见笔记卡片容器（可能随平台版本变化，仅用于统计） */
  const NOTE_SECTION_SELECTOR = 'section.note-item';
  /** 搜索结果常见容器（可能随平台版本变化，仅用于统计） */
  const RESULT_CONTAINER_SELECTOR = 'div.feeds-container';
  /** 典型 SPA 挂载点 */
  const APP_SHELL_SELECTOR = '#app, #root';
  function collectSignals(doc) {
      const links = Array.from(doc.querySelectorAll(NOTE_LINK_SELECTOR));
      const uniqueHrefs = new Set();
      for (const link of links) {
          const href = link.href;
          if (href)
              uniqueHrefs.add(href);
      }
      return {
          noteSections: doc.querySelectorAll(NOTE_SECTION_SELECTOR).length,
          exploreLinks: links.length,
          uniqueNoteLinks: uniqueHrefs.size,
          resultContainers: doc.querySelectorAll(RESULT_CONTAINER_SELECTOR).length,
          appShellRendered: doc.querySelector(APP_SHELL_SELECTOR) != null,
          readyState: doc.readyState,
          // 以下两个判定依赖真实页面的信号特征，阶段 3 依据实测编码（诚实降级）
          loginWallDetected: false,
          captchaDetected: false,
      };
  }

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

  // 时间工具
  function nowIso() {
      return new Date().toISOString();
  }

  // URL 解析与笔记链接规范化（docs/03 §10 去重规则第 1–2 条）
  // 纯函数，可在 Node/浏览器/内容脚本中运行。
  const XHS_HOST_RE = /(^|\.)xiaohongshu\.com$/i;
  function parsePageUrl(url) {
      if (!url)
          return null;
      try {
          const u = new URL(url);
          const host = u.hostname.toLowerCase();
          return {
              host,
              pathname: u.pathname,
              isXiaohongshu: XHS_HOST_RE.test(host),
          };
      }
      catch {
          return null;
      }
  }
  /** 隐私安全 URL：仅 origin 的主机名 + pathname，丢弃全部查询参数 */
  function toPrivacySafePageUrl(url) {
      const parsed = parsePageUrl(url);
      if (!parsed)
          return null;
      return `${parsed.host}${parsed.pathname}`;
  }

  // 诊断信息组装（docs/03 §8、docs/04 §1）
  // 隐私约束：pageUrl 仅 origin+pathname；不含笔记正文、用户信息、Cookie。
  function buildDiagnostics(ctx) {
      const startedAt = nowIso();
      const startedMs = Date.now();
      const errors = [];
      if (!ctx.supported) {
          errors.push({
              code: ErrorCode.UNSUPPORTED_PAGE,
              message: messageFor(ErrorCode.UNSUPPORTED_PAGE),
              detail: `host=${ctx.host ?? 'unknown'}`,
          });
      }
      else if (ctx.signals.readyState !== 'complete') {
          errors.push({
              code: ErrorCode.PAGE_NOT_READY,
              message: messageFor(ErrorCode.PAGE_NOT_READY),
              detail: `readyState=${ctx.signals.readyState}`,
          });
      }
      else if (ctx.candidates === 0 && ctx.signals.noteSections === 0) {
          // 可能是未登录/验证墙/无结果页；具体判定模式待阶段 3 实测后编码
          errors.push({
              code: ErrorCode.NO_VISIBLE_NOTES,
              message: messageFor(ErrorCode.NO_VISIBLE_NOTES),
          });
      }
      return {
          startedAt,
          finishedAt: nowIso(),
          durationMs: Date.now() - startedMs,
          pageType: ctx.pageType,
          pageUrl: toPrivacySafePageUrl(ctx.pageUrl) ?? 'unknown',
          isSupported: ctx.supported,
          selectorVersion: SELECTOR_VERSION,
          totalCandidates: ctx.candidates,
          extracted: 0,
          partial: 0,
          skipped: 0,
          skipReasons: {},
          signals: ctx.signals,
          errors,
      };
  }

  // 小红书页面适配器（探针版）
  // 阶段 2：只读诊断（结构信号统计），不做正式笔记提取。
  // 阶段 3：依据 verification-results.md 的真实信号实现 extractVisibleNotes / normalizeNote。
  function createXiaohongshuAdapter(pageUrl, doc) {
      const parsed = parsePageUrl(pageUrl);
      const supported = parsed?.isXiaohongshu ?? false;
      const host = parsed?.host ?? null;
      const pageType = classifyPageType(parsed?.pathname ?? '');
      return {
          isSupportedPage: () => supported,
          getPageType: () => (supported ? pageType : 'other'),
          // 阶段 3 实现正式提取（当前返回空，绝不伪造数据）
          extractVisibleNotes: () => [],
          normalizeNote: (draft) => draft,
          getExtractionDiagnostics: () => {
              const signals = collectSignals(doc);
              return buildDiagnostics({
                  pageUrl,
                  supported,
                  host,
                  pageType,
                  signals,
                  candidates: signals.uniqueNoteLinks,
              });
          },
          validateExtractionResult: (drafts) => {
              if (drafts.length === 0) {
                  return { valid: false, problems: ['未提取到任何笔记'] };
              }
              return { valid: true, problems: [] };
          },
      };
  }
  /** 页面类型启发式分类（依据公开 URL 路径特征；真实环境以实测为准） */
  function classifyPageType(pathname) {
      if (pathname.startsWith('/search_result') || pathname.startsWith('/search')) {
          return 'search_results';
      }
      if (/^\/(explore|discovery\/item)\//i.test(pathname)) {
          return 'note_detail';
      }
      if (pathname.startsWith('/user/profile')) {
          return 'profile';
      }
      return 'other';
  }

  // 内容脚本与 background 之间约定的全局键名
  // 内容脚本把诊断结果写入 isolated world 的该键，background 侧再读取。
  const DIAGNOSTICS_GLOBAL_KEY = '__CANTON_FAIR_LAST_DIAGNOSTICS__';

  // 内容脚本入口（按需注入，IIFE 打包为 dist/content.js）
  //
  // 注意：打包成 IIFE 后整个文件是「变量赋值语句」，脚本完成值为空 ——
  // 因此不能依赖 executeScript 的返回值拿到诊断结果。
  // 这里把结果显式写到 isolated world 的全局对象上，
  // 由 background 侧二次注入自包含函数读回（见 src/platform/scripting.ts）。
  const diagnostics = createXiaohongshuAdapter(window.location.href, document).getExtractionDiagnostics();
  globalThis[DIAGNOSTICS_GLOBAL_KEY] = diagnostics;

})();
