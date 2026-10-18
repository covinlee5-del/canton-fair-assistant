import { useState } from 'react';
import { Button } from '../../shared/components/Button';
import { formatDateTime } from '../../../shared/utils/time';
import type { ExtractionDiagnostics } from '../../../shared/types/extraction';

const PAGE_TYPE_LABELS: Record<string, string> = {
  search_results: '搜索结果页',
  note_detail: '笔记详情页',
  profile: '个人主页',
  other: '其他页面',
};

interface ReadResultProps {
  diagnostics: ExtractionDiagnostics | null;
}

export function ReadResult({ diagnostics }: ReadResultProps) {
  const [copied, setCopied] = useState(false);

  if (!diagnostics) {
    return (
      <section className="card">
        <h2>最近读取结果</h2>
        <p className="muted">
          尚未读取。打开小红书搜索结果页，然后点击上方“读取当前页面诊断”。
        </p>
      </section>
    );
  }

  const json = JSON.stringify(diagnostics, null, 2);

  async function copyJson(): Promise<void> {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用时静默失败，用户仍可手动展开复制
    }
  }

  return (
    <section className="card">
      <h2>最近读取结果</h2>
      <dl className="diag-summary">
        <div>
          <dt>页面类型</dt>
          <dd>{PAGE_TYPE_LABELS[diagnostics.pageType ?? 'other'] ?? '未知'}</dd>
        </div>
        <div>
          <dt>页面地址</dt>
          <dd>{diagnostics.pageUrl}</dd>
        </div>
        <div>
          <dt>候选笔记</dt>
          <dd>{diagnostics.totalCandidates}（去重链接数）</dd>
        </div>
        <div>
          <dt>笔记卡片</dt>
          <dd>{diagnostics.signals.noteSections} 个</dd>
        </div>
        <div>
          <dt>读取时间</dt>
          <dd>{formatDateTime(diagnostics.finishedAt)}</dd>
        </div>
        <div>
          <dt>提取器版本</dt>
          <dd>{diagnostics.selectorVersion}</dd>
        </div>
      </dl>
      {diagnostics.errors.length > 0 ? (
        <ul className="diag-errors">
          {diagnostics.errors.map((err, index) => (
            <li key={index}>
              {err.code}：{err.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">未发现错误。本阶段为只读诊断，正式提取将在阶段 3 实现。</p>
      )}
      <div className="row">
        <Button onClick={() => void copyJson()}>{copied ? '已复制' : '复制诊断 JSON'}</Button>
      </div>
      <details style={{ marginTop: 8 }}>
        <summary>原始诊断 JSON</summary>
        <pre className="json">{json}</pre>
      </details>
    </section>
  );
}
