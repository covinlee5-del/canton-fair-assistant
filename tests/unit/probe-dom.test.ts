// @vitest-environment jsdom
// 探针 DOM 信号收集测试（模拟页面，不等于真实页面验证）

import { describe, expect, it } from 'vitest';
import { collectSignals, SELECTOR_VERSION } from '../../src/content/adapters/selectors';
import { createXiaohongshuAdapter } from '../../src/content/adapters/xiaohongshu-adapter';

const NOTE_ID = '65f1a2b3c4d5e6f708192a3b';

function buildDoc(html: string): Document {
  return new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${html}</body></html>`, 'text/html');
}

describe('collectSignals', () => {
  it('统计笔记卡片、链接与去重链接数', () => {
    const doc = buildDoc(`
      <div id="app">
        <div class="feeds-container">
          <section class="note-item">
            <a href="https://www.xiaohongshu.com/explore/${NOTE_ID}">note</a>
          </section>
          <section class="note-item">
            <a href="https://www.xiaohongshu.com/explore/${NOTE_ID}?xsec_token=x">same note</a>
          </section>
          <section class="note-item">
            <a href="https://www.xiaohongshu.com/discovery/item/65f1a2b3c4d5e6f708192a3c">other</a>
          </section>
        </div>
      </div>
    `);
    const signals = collectSignals(doc);
    expect(signals.noteSections).toBe(3);
    expect(signals.exploreLinks).toBe(3);
    // 同一笔记的带参链接与去重后链接数：两个 explore 链接 + 一个 discovery 链接 = 3 个不同 href，
    // 但其中前两个指向同一笔记 ID —— 此处只验证结构信号计数（去重由规范化层负责）
    expect(signals.uniqueNoteLinks).toBe(3);
    expect(signals.resultContainers).toBe(1);
    expect(signals.appShellRendered).toBe(true);
  });

  it('空页面返回 0 且标记 app shell 缺失', () => {
    const signals = collectSignals(buildDoc('<p>nothing</p>'));
    expect(signals.noteSections).toBe(0);
    expect(signals.exploreLinks).toBe(0);
    expect(signals.uniqueNoteLinks).toBe(0);
    expect(signals.appShellRendered).toBe(false);
  });
});

describe('xiaohongshu adapter（探针版）', () => {
  it('识别受支持的搜索结果页', () => {
    const adapter = createXiaohongshuAdapter(
      'https://www.xiaohongshu.com/search_result?keyword=Canton%20Fair',
      buildDoc(''),
    );
    expect(adapter.isSupportedPage()).toBe(true);
    expect(adapter.getPageType()).toBe('search_results');
  });

  it('非小红书页面标记为不支持且类型为 other', () => {
    const adapter = createXiaohongshuAdapter('https://example.com/foo', buildDoc(''));
    expect(adapter.isSupportedPage()).toBe(false);
    expect(adapter.getPageType()).toBe('other');
  });

  it('阶段 2 不产生笔记草稿（不伪造数据）', () => {
    const adapter = createXiaohongshuAdapter(
      'https://www.xiaohongshu.com/search_result',
      buildDoc(''),
    );
    expect(adapter.extractVisibleNotes()).toEqual([]);
  });

  it('诊断包含选择器版本与真实结构信号', () => {
    const adapter = createXiaohongshuAdapter(
      'https://www.xiaohongshu.com/search_result?keyword=x',
      buildDoc(`<div id="app"><section class="note-item"><a href="https://www.xiaohongshu.com/explore/${NOTE_ID}">n</a></section></div>`),
    );
    const diag = adapter.getExtractionDiagnostics();
    expect(diag.selectorVersion).toBe(SELECTOR_VERSION);
    expect(diag.isSupported).toBe(true);
    expect(diag.pageUrl).toBe('www.xiaohongshu.com/search_result');
    expect(diag.signals.noteSections).toBe(1);
    expect(diag.totalCandidates).toBe(1);
  });
});
