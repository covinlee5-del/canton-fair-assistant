// 诊断与页面分类单元测试（不依赖真实页面）

import { describe, expect, it } from 'vitest';
import { buildDiagnostics } from '../../src/content/diagnostics';
import { classifyPageType } from '../../src/content/adapters/xiaohongshu-adapter';
import { ErrorCode } from '../../src/shared/types/base';
import type { PageSignals } from '../../src/shared/types/extraction';

function signals(overrides: Partial<PageSignals> = {}): PageSignals {
  return {
    noteSections: 0,
    exploreLinks: 0,
    uniqueNoteLinks: 0,
    resultContainers: 0,
    appShellRendered: true,
    readyState: 'complete',
    loginWallDetected: false,
    captchaDetected: false,
    ...overrides,
  };
}

describe('classifyPageType', () => {
  it('识别搜索结果页', () => {
    expect(classifyPageType('/search_result')).toBe('search_results');
  });

  it('识别笔记详情页', () => {
    expect(classifyPageType('/explore/65f1a2b3c4d5e6f708192a3b')).toBe('note_detail');
    expect(classifyPageType('/discovery/item/65f1a2b3c4d5e6f708192a3b')).toBe('note_detail');
  });

  it('识别个人主页与其他页面', () => {
    expect(classifyPageType('/user/profile/abc')).toBe('profile');
    expect(classifyPageType('/')).toBe('other');
  });
});

describe('buildDiagnostics', () => {
  it('不支持的页面写入 UNSUPPORTED_PAGE', () => {
    const diag = buildDiagnostics({
      pageUrl: 'https://example.com/search',
      supported: false,
      host: 'example.com',
      pageType: 'other',
      signals: signals(),
      candidates: 0,
    });
    expect(diag.isSupported).toBe(false);
    expect(diag.errors.map((e) => e.code)).toContain(ErrorCode.UNSUPPORTED_PAGE);
  });

  it('页面未加载完成写入 PAGE_NOT_READY', () => {
    const diag = buildDiagnostics({
      pageUrl: 'https://www.xiaohongshu.com/search_result',
      supported: true,
      host: 'www.xiaohongshu.com',
      pageType: 'search_results',
      signals: signals({ readyState: 'loading' }),
      candidates: 0,
    });
    expect(diag.errors.map((e) => e.code)).toContain(ErrorCode.PAGE_NOT_READY);
  });

  it('无候选笔记写入 NO_VISIBLE_NOTES', () => {
    const diag = buildDiagnostics({
      pageUrl: 'https://www.xiaohongshu.com/search_result',
      supported: true,
      host: 'www.xiaohongshu.com',
      pageType: 'search_results',
      signals: signals(),
      candidates: 0,
    });
    expect(diag.errors.map((e) => e.code)).toContain(ErrorCode.NO_VISIBLE_NOTES);
  });

  it('有候选笔记且页面支持时不产生错误', () => {
    const diag = buildDiagnostics({
      pageUrl: 'https://www.xiaohongshu.com/search_result',
      supported: true,
      host: 'www.xiaohongshu.com',
      pageType: 'search_results',
      signals: signals({ noteSections: 5, exploreLinks: 5, uniqueNoteLinks: 5 }),
      candidates: 5,
    });
    expect(diag.errors).toHaveLength(0);
    expect(diag.totalCandidates).toBe(5);
    expect(diag.extracted).toBe(0); // 阶段 2 只做诊断，不提取
  });

  it('诊断中的页面地址不含查询参数（隐私）', () => {
    const diag = buildDiagnostics({
      pageUrl: 'https://www.xiaohongshu.com/search_result?keyword=广交会&xsec_token=secret',
      supported: true,
      host: 'www.xiaohongshu.com',
      pageType: 'search_results',
      signals: signals(),
      candidates: 0,
    });
    expect(diag.pageUrl).toBe('www.xiaohongshu.com/search_result');
    expect(diag.pageUrl).not.toContain('xsec_token');
  });
});
