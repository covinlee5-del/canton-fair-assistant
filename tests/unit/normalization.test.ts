import { describe, expect, it } from 'vitest';
import {
  buildNoteOpenUrl,
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

describe('buildNoteOpenUrl（修复：打开笔记报 300031 / 扫码登录）', () => {
  it('保留 xsec_token 与 xsec_source，否则打开会被要求扫码', () => {
    const url = `https://www.xiaohongshu.com/explore/${NOTE_ID}?xsec_token=ABtok123&xsec_source=pc_search`;
    const opened = buildNoteOpenUrl(url);
    expect(opened).not.toBeNull();
    const parsed = new URL(opened!);
    expect(parsed.pathname).toBe(`/explore/${NOTE_ID}`);
    expect(parsed.searchParams.get('xsec_token')).toBe('ABtok123');
    expect(parsed.searchParams.get('xsec_source')).toBe('pc_search');
  });

  // 2026-10-19 实测真实链接，逐字复刻：路径是 /search_result/，token 末尾带 '='
  it('原样复刻实测链接：/search_result/ 路径 + token 末尾的 = 不得被转义', () => {
    const real =
      'https://www.xiaohongshu.com/search_result/6ad042c8000000000b005f69' +
      '?xsec_token=ABt8NU38osQAK2s2mjmBqJ65KkEgjwPT0gIUxcrBnaEU0=&xsec_source=';
    const opened = buildNoteOpenUrl(real);
    expect(opened).toBe(
      'https://www.xiaohongshu.com/search_result/6ad042c8000000000b005f69' +
        '?xsec_token=ABt8NU38osQAK2s2mjmBqJ65KkEgjwPT0gIUxcrBnaEU0=',
    );
    // 关键：不能出现 %3D 转义
    expect(opened?.endsWith('EU0=')).toBe(true);
    expect(opened?.includes('%3D')).toBe(false);
  });

  it('路径原样保留：/search_result/ 不被改写成 /explore/', () => {
    const url = `https://www.xiaohongshu.com/search_result/${NOTE_ID}?xsec_token=T`;
    expect(buildNoteOpenUrl(url)).toBe(
      `https://www.xiaohongshu.com/search_result/${NOTE_ID}?xsec_token=T`,
    );
  });

  it('丢弃追踪类参数，只留白名单内的', () => {
    const url =
      `https://www.xiaohongshu.com/explore/${NOTE_ID}` +
      '?xsec_token=T&utm_source=share&share_from_user_hidden=true&referer=abc';
    const parsed = new URL(buildNoteOpenUrl(url)!);
    expect([...parsed.searchParams.keys()]).toEqual(['xsec_token']);
  });

  it('没有查询参数时退化为不带参数的原路径', () => {
    const url = `https://www.xiaohongshu.com/explore/${NOTE_ID}`;
    expect(buildNoteOpenUrl(url)).toBe(`https://www.xiaohongshu.com/explore/${NOTE_ID}`);
  });

  it('/discovery/item/ 保留原路径并保留 token', () => {
    const url = `https://www.xiaohongshu.com/discovery/item/${NOTE_ID}?xsec_token=Z9`;
    const parsed = new URL(buildNoteOpenUrl(url)!);
    expect(parsed.pathname).toBe(`/discovery/item/${NOTE_ID}`);
    expect(parsed.searchParams.get('xsec_token')).toBe('Z9');
  });

  it('非法或非小红书链接返回 null', () => {
    expect(buildNoteOpenUrl(`https://example.com/explore/${NOTE_ID}?xsec_token=x`)).toBeNull();
    expect(buildNoteOpenUrl('not a url')).toBeNull();
    expect(buildNoteOpenUrl(null)).toBeNull();
  });

  it('token 变化不影响去重键（canonicalUrl 始终不带 query）', () => {
    const a = `https://www.xiaohongshu.com/explore/${NOTE_ID}?xsec_token=A&xsec_source=pc_search`;
    const b = `https://www.xiaohongshu.com/explore/${NOTE_ID}?xsec_token=B&xsec_source=pc_feed`;
    expect(canonicalizeNoteUrl(a)).toBe(canonicalizeNoteUrl(b));
    expect(buildNoteOpenUrl(a)).not.toBe(buildNoteOpenUrl(b));
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
