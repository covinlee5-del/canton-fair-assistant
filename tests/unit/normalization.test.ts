import { describe, expect, it } from 'vitest';
import {
  canonicalizeNoteUrl,
  extractNoteId,
  parsePageUrl,
  toPrivacySafePageUrl,
} from '../../src/shared/domain/normalization';

const NOTE_ID = '65f1a2b3c4d5e6f708192a3b';

describe('canonicalizeNoteUrl', () => {
  it('规范化 /explore/ 链接并丢弃全部查询参数', () => {
    const url = `https://www.xiaohongshu.com/explore/${NOTE_ID}?xsec_token=abc&xsec_source=pc_feed`;
    expect(canonicalizeNoteUrl(url)).toBe(`https://www.xiaohongshu.com/explore/${NOTE_ID}`);
  });

  it('支持 /discovery/item/ 链接并统一为 /explore/', () => {
    const url = `https://www.xiaohongshu.com/discovery/item/${NOTE_ID}?source=share`;
    expect(canonicalizeNoteUrl(url)).toBe(`https://www.xiaohongshu.com/explore/${NOTE_ID}`);
  });

  it('非小红书域名返回 null', () => {
    expect(canonicalizeNoteUrl(`https://example.com/explore/${NOTE_ID}`)).toBeNull();
    expect(canonicalizeNoteUrl(`https://xiaohongshu.com.evil.example/explore/${NOTE_ID}`)).toBeNull();
  });

  it('缺少合法笔记 ID 时返回 null', () => {
    expect(canonicalizeNoteUrl('https://www.xiaohongshu.com/explore/')).toBeNull();
    expect(canonicalizeNoteUrl('https://www.xiaohongshu.com/explore/not-a-valid-id')).toBeNull();
  });

  it('非法输入返回 null（不抛异常）', () => {
    expect(canonicalizeNoteUrl('not a url')).toBeNull();
    expect(canonicalizeNoteUrl(null)).toBeNull();
    expect(canonicalizeNoteUrl(undefined)).toBeNull();
  });
});

describe('extractNoteId', () => {
  it('提取 24 位十六进制笔记 ID', () => {
    expect(extractNoteId(`https://www.xiaohongshu.com/explore/${NOTE_ID}`)).toBe(NOTE_ID);
  });

  it('搜索结果页等非笔记路径返回 null', () => {
    expect(extractNoteId('https://www.xiaohongshu.com/search_result?keyword=abc')).toBeNull();
  });
});

describe('parsePageUrl', () => {
  it('识别小红书域名', () => {
    const parsed = parsePageUrl('https://www.xiaohongshu.com/search_result?keyword=x');
    expect(parsed?.isXiaohongshu).toBe(true);
    expect(parsed?.host).toBe('www.xiaohongshu.com');
    expect(parsed?.pathname).toBe('/search_result');
  });

  it('相似域名不会被误判', () => {
    const parsed = parsePageUrl('https://xiaohongshu.com.evil.example/explore/abc');
    expect(parsed?.isXiaohongshu).toBe(false);
  });

  it('非法 URL 返回 null', () => {
    expect(parsePageUrl('')).toBeNull();
    expect(parsePageUrl('')).toBeNull();
  });
});

describe('toPrivacySafePageUrl', () => {
  it('只保留 host 与 pathname（隐私约束）', () => {
    expect(
      toPrivacySafePageUrl('https://www.xiaohongshu.com/search_result?keyword=广交会&xsec_token=secret'),
    ).toBe('www.xiaohongshu.com/search_result');
  });

  it('不含查询参数与 hash', () => {
    const safe = toPrivacySafePageUrl('https://www.xiaohongshu.com/explore/abc?foo=1#bar');
    expect(safe).toBe('www.xiaohongshu.com/explore/abc');
    expect(safe).not.toContain('?');
    expect(safe).not.toContain('#');
  });
});
