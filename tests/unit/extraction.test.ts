// @vitest-environment jsdom
// 提取器测试（阶段 3 T3.2 / T3.8 / T3.9）
//
// 用 tests/fixtures/*.html 模拟页面结构，验证：
//   1) 搜索页能取出 title / canonicalUrl / noteId / author / snippet / timeText；
//   2) 懒加载占位卡片被跳过，绝不伪造数据；
//   3) 详情页类型判定正确（叠加层下的卡片不误判）；
//   4) 改版页 / 空结果页 / 登录墙都给出明确错误码，绝不静默返回空列表。
//
// 注意：模拟页面只证明提取逻辑正确，不代表真实页面可读（真实复验见 docs/verification-results.md §8）。

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createXiaohongshuAdapter,
  extractNotesFromDocument,
} from '../../src/content/adapters/xiaohongshu-adapter';
import {
  MAX_CARDS_PER_SCAN,
  SELECTOR_MAP,
  SELECTOR_VERSION,
} from '../../src/content/adapters/selectors';
import { ErrorCode } from '../../src/shared/types/base';

const FIXTURE_DIR = 'tests/fixtures';

function loadFixture(name: string): Document {
  // 相对路径按 vitest 的 cwd（项目根）解析，避免依赖 import.meta.url
  // —— jsdom 环境下 import.meta.url 是 http:// 而非 file://，无法用于读文件。
  const html = readFileSync(`${FIXTURE_DIR}/${name}`, 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

const SEARCH_URL = 'https://www.xiaohongshu.com/search_result_ai?keyword=广交会';

describe('T3.1 选择器注册表', () => {
  it('版本号已升级到 xhs-1.0.0', () => {
    expect(SELECTOR_VERSION).toBe('xhs-1.0.0');
  });

  it('每个字段都有候选选择器 + 来源 + 证据（可回溯到某次实测）', () => {
    expect(SELECTOR_MAP.length).toBeGreaterThanOrEqual(8);
    for (const rule of SELECTOR_MAP) {
      expect(rule.field.length).toBeGreaterThan(0);
      expect(rule.selectors.length).toBeGreaterThan(0);
      expect(['measured', 'inferred', 'fallback']).toContain(rule.source);
      expect(rule.evidence.length).toBeGreaterThan(0);
    }
    const fields = SELECTOR_MAP.map((r) => r.field);
    expect(fields).toContain('card');
    expect(fields).toContain('link');
    expect(fields).toContain('title');
    expect(fields).toContain('author');
    expect(fields).toContain('time');
  });
});

describe('T3.2 搜索页提取', () => {
  it('提取出 title / canonicalUrl / noteId / author / timeText', () => {
    const adapter = createXiaohongshuAdapter(SEARCH_URL, loadFixture('search-page.html'));
    const drafts = adapter.extractVisibleNotes();

    expect(drafts).toHaveLength(4); // 5 张卡片里有 1 张是懒加载占位
    const first = drafts[0];
    expect(first?.title).toBe('广交会翻译兼职第一天，真实感受分享');
    expect(first?.noteId).toBe('65f1a2b3c4d5e6f708192a3b');
    expect(first?.canonicalUrl).toBe(
      'https://www.xiaohongshu.com/explore/65f1a2b3c4d5e6f708192a3b',
    );
    expect(first?.authorDisplayName).toBe('小鹿翻译日记');
    expect(first?.timeText).toBe('3 天前');
    expect(first?.publishedAtRaw).toBe('3 天前');
    expect(first?.quality).toBe('complete');
    expect(first?.missingFields).toEqual([]);
  });

  it('相对链接补全为绝对 URL，去重链接丢弃 xsec_token', () => {
    const drafts = extractNotesFromDocument(loadFixture('search-page.html')).drafts;
    expect(drafts[0]?.url).toContain('https://www.xiaohongshu.com/explore/');
    expect(drafts[0]?.canonicalUrl).not.toContain('xsec_token');
  });

  it('openUrl 保留 xsec_token（否则打开笔记会被要求扫码登录）', () => {
    const drafts = extractNotesFromDocument(loadFixture('search-page.html')).drafts;
    const first = drafts[0];
    expect(first?.openUrl).toBeTruthy();
    expect(first?.openUrl).toContain('xsec_token=');
    expect(first?.openUrl).toContain('https://www.xiaohongshu.com/explore/');
  });

  it('绝对链接原样保留，摘要按可见文本提取', () => {
    const drafts = extractNotesFromDocument(loadFixture('search-page.html')).drafts;
    const withSnippet = drafts.find((d) => d.noteId === '65f1a2b3c4d5e6f708192a3c');
    expect(withSnippet?.title).toBe('Canton Fair 2026 需要英语陪同翻译吗');
    expect(withSnippet?.snippet).toContain('今年秋季广交会第三期');
    expect(withSnippet?.timeText).toBe('2026-03-05');
  });

  it('懒加载占位卡片被跳过并计入 skipReasons，不产生空草稿', () => {
    const outcome = extractNotesFromDocument(loadFixture('search-page.html'));
    expect(outcome.totalCandidates).toBe(5);
    expect(outcome.skipped).toBe(1);
    expect(outcome.skipReasons['no-identifiable-content']).toBe(1);
    expect(outcome.drafts.every((d) => d.url !== null || d.title !== null)).toBe(true);
  });

  it('标题与摘要按上限截断（防止数据库膨胀）', () => {
    const longTitle = '广'.repeat(200);
    const longSnippet = '会'.repeat(400);
    const doc = new DOMParser().parseFromString(
      `<!DOCTYPE html><html><body><div class="feeds-container">
        <section class="note-item">
          <a class="cover" href="/explore/65f1a2b3c4d5e6f708192a3f"><img alt="" /></a>
          <div class="footer">
            <a class="title" href="/explore/65f1a2b3c4d5e6f708192a3f"><span>${longTitle}</span></a>
            <p class="desc">${longSnippet}</p>
            <div class="author-wrapper"><span class="name">某人</span><span class="time">刚刚</span></div>
          </div>
        </section>
      </div></body></html>`,
      'text/html',
    );
    const draft = extractNotesFromDocument(doc).drafts[0];
    expect(draft?.title?.length).toBeLessThanOrEqual(120);
    expect(draft?.snippet?.length).toBeLessThanOrEqual(200);
    expect(draft?.title?.endsWith('…')).toBe(true);
  });

  it('诊断与提取使用同一份扫描结果（条数一致）', () => {
    const adapter = createXiaohongshuAdapter(SEARCH_URL, loadFixture('search-page.html'));
    const drafts = adapter.extractVisibleNotes();
    const diag = adapter.getExtractionDiagnostics();
    expect(diag.extracted).toBe(drafts.length);
    expect(diag.selectorVersion).toBe(SELECTOR_VERSION);
    expect(diag.pageType).toBe('search_results');
    expect(diag.errors).toHaveLength(0);
  });

  it('单次扫描上限 300 张，超出部分计入 scan-limit', () => {
    const card = (i: number) =>
      `<section class="note-item"><a class="cover" href="/explore/65f1a2b3c4d5e6f70819${String(
        2000 + i,
      ).padStart(4, '0')}"><img alt="" /></a><div class="footer"><a class="title" href="/explore/x"><span>标题${i}</span></a><div class="author-wrapper"><span class="name">a</span><span class="time">刚刚</span></div></div></section>`;
    const many = Array.from({ length: MAX_CARDS_PER_SCAN + 5 }, (_, i) => card(i)).join('');
    const doc = new DOMParser().parseFromString(
      `<!DOCTYPE html><html><body><div class="feeds-container">${many}</div></body></html>`,
      'text/html',
    );
    const outcome = extractNotesFromDocument(doc);
    expect(outcome.truncated).toBe(true);
    expect(outcome.drafts.length).toBeLessThanOrEqual(MAX_CARDS_PER_SCAN);
    expect(outcome.skipReasons['scan-limit']).toBe(5);
  });
});

describe('T3.9 详情页 fixture', () => {
  it('识别为 note_detail，且不提取叠加层下的搜索卡片', () => {
    const adapter = createXiaohongshuAdapter(
      'https://www.xiaohongshu.com/explore/65f1a2b3c4d5e6f708192a3e',
      loadFixture('note-detail.html'),
    );
    expect(adapter.getPageType()).toBe('note_detail');
    expect(adapter.extractVisibleNotes()).toHaveLength(0);
    const diag = adapter.getExtractionDiagnostics();
    expect(diag.pageType).toBe('note_detail');
    // 卡片确实存在（叠加层下），但页面类型是详情页 —— 两者是两件事（观察 A）
    expect(diag.signals.noteSections).toBe(1);
    expect(diag.extracted).toBe(0);
    // 真实页面复验暴露的 bug：此处曾报 NO_VISIBLE_NOTES（"没有识别到笔记"），
    // 与界面上「识别卡片 N 个」自相矛盾。详情页必须报专门错误码，说明是页面类型问题。
    expect(diag.errors.map((error) => error.code)).toContain(ErrorCode.NOT_SEARCH_RESULTS);
    expect(diag.errors.map((error) => error.code)).not.toContain(ErrorCode.NO_VISIBLE_NOTES);
    // 「识别卡片」现在取 totalCandidates，保证 提取 + 跳过 = 识别，不再出现 30/0/0
    expect(diag.totalCandidates).toBe(0);
    expect(diag.extracted + diag.skipped).toBe(diag.totalCandidates);
  });

  it('扫描耗时取自真实扫描区间，不会恒为 0', () => {
    const adapter = createXiaohongshuAdapter(SEARCH_URL, loadFixture('search-page.html'));
    const diag = adapter.getExtractionDiagnostics();
    // 真实页面复验暴露的 bug：startedAt 曾在扫描之后才取，导致 durationMs 恒为 0
    expect(Number.isNaN(Date.parse(diag.startedAt))).toBe(false);
    expect(Number.isNaN(Date.parse(diag.finishedAt))).toBe(false);
    const expected = Date.parse(diag.finishedAt) - Date.parse(diag.startedAt);
    expect(diag.durationMs).toBe(expected);
    expect(diag.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('T3.8 失效降级', () => {
  it('改版页面（卡片在但取不出笔记）报 DOM_STRUCTURE_CHANGED', () => {
    const adapter = createXiaohongshuAdapter(SEARCH_URL, loadFixture('changed-structure.html'));
    const drafts = adapter.extractVisibleNotes();
    expect(drafts).toHaveLength(0);

    const diag = adapter.getExtractionDiagnostics();
    expect(diag.signals.noteSections).toBe(3);
    expect(diag.extracted).toBe(0);
    const codes = diag.errors.map((e) => e.code);
    expect(codes).toContain(ErrorCode.DOM_STRUCTURE_CHANGED);
    expect(diag.errors[0]?.message).toContain('页面结构');
    expect(diag.errors[0]?.detail).toContain(SELECTOR_VERSION);
  });

  it('空结果页报 NO_VISIBLE_NOTES（不是静默空列表）', () => {
    const adapter = createXiaohongshuAdapter(SEARCH_URL, loadFixture('search-empty.html'));
    const diag = adapter.getExtractionDiagnostics();
    expect(adapter.extractVisibleNotes()).toHaveLength(0);
    expect(diag.errors.map((e) => e.code)).toContain(ErrorCode.NO_VISIBLE_NOTES);
  });

  it('登录墙报 LOGIN_REQUIRED（只提示，不绕过）', () => {
    const adapter = createXiaohongshuAdapter(SEARCH_URL, loadFixture('login-wall.html'));
    const diag = adapter.getExtractionDiagnostics();
    expect(diag.signals.loginWallDetected).toBe(true);
    expect(diag.errors.map((e) => e.code)).toContain(ErrorCode.LOGIN_REQUIRED);
  });

  it('完全空 DOM 报 NO_VISIBLE_NOTES', () => {
    const doc = new DOMParser().parseFromString(
      '<!DOCTYPE html><html><body></body></html>',
      'text/html',
    );
    const adapter = createXiaohongshuAdapter(SEARCH_URL, doc);
    const diag = adapter.getExtractionDiagnostics();
    expect(diag.extracted).toBe(0);
    expect(diag.errors.map((e) => e.code)).toContain(ErrorCode.NO_VISIBLE_NOTES);
  });

  it('非小红书页面报 UNSUPPORTED_PAGE 且不提取', () => {
    const adapter = createXiaohongshuAdapter(
      'https://example.com/search_result',
      loadFixture('search-page.html'),
    );
    expect(adapter.isSupportedPage()).toBe(false);
    expect(adapter.getPageType()).toBe('other');
    const diag = adapter.getExtractionDiagnostics();
    expect(diag.errors.map((e) => e.code)).toContain(ErrorCode.UNSUPPORTED_PAGE);
  });

  it('validateExtractionResult 对空结果与缺字段给出明确问题', () => {
    const adapter = createXiaohongshuAdapter(SEARCH_URL, loadFixture('search-page.html'));
    expect(adapter.validateExtractionResult([]).valid).toBe(false);
    const drafts = adapter.extractVisibleNotes();
    expect(adapter.validateExtractionResult(drafts).valid).toBe(true);
  });
});
