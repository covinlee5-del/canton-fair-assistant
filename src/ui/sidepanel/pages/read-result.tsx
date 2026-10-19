import { useState } from 'react';
import { Button } from '../../shared/components/Button';
import { NoteCard } from '../../shared/components/NoteCard';
import { formatDateTime } from '../../../shared/utils/time';
import type { AppError } from '../../../shared/types/base';
import type {
  ExtractionDiagnostics,
  ReadPageProcessed,
} from '../../../shared/types/extraction';
import type { Note } from '../../../shared/types/note';
import type { PromotionalCopy } from '../../../shared/types/copy';

const PAGE_TYPE_LABELS: Record<string, string> = {
  search_results: '搜索结果页',
  note_detail: '笔记详情页',
  profile: '个人主页',
  other: '其他页面',
};

interface ReadResultProps {
  diagnostics: ExtractionDiagnostics | null;
  notes: Note[];
  processed: ReadPageProcessed | null;
  loading?: boolean;
  /** 当前任务关联的文案（为空时不显示复制文案入口） */
  copies?: PromotionalCopy[];
  selectedCopyId?: string;
  onSelectCopy?: (copyId: string) => void;
  taskId?: string | null;
  onStatusChange?: (note: Note, status: Note['status']) => void;
  onError?: (error: AppError) => void;
}

export function ReadResult({
  diagnostics,
  notes,
  processed,
  loading = false,
  copies = [],
  selectedCopyId,
  onSelectCopy,
  taskId = null,
  onStatusChange,
  onError,
}: ReadResultProps) {
  const [copied, setCopied] = useState(false);
  const copyChoices = copies.map((copy) => ({ id: copy.id, name: copy.name, content: copy.content }));

  if (!diagnostics) {
    return (
      <section className="card">
        <h2>最近读取结果</h2>
        <p className="muted">
          尚未读取。打开小红书搜索结果页，然后点击上方“读取当前页面笔记”。
        </p>
      </section>
    );
  }

  const json = JSON.stringify(diagnostics, null, 2);
  const scanLimited = (diagnostics.skipReasons['scan-limit'] ?? 0) > 0;

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
    <>
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
            <dt>识别卡片</dt>
            <dd>{diagnostics.totalCandidates} 个</dd>
          </div>
          <div>
            <dt>成功提取</dt>
            <dd>
              {diagnostics.extracted} 条
              {diagnostics.partial > 0 ? `（其中 ${diagnostics.partial} 条信息不完整）` : ''}
            </dd>
          </div>
          <div>
            <dt>跳过卡片</dt>
            <dd>{diagnostics.skipped} 个</dd>
          </div>
          <div>
            <dt>读取时间</dt>
            <dd>{formatDateTime(diagnostics.finishedAt)}</dd>
          </div>
          <div>
            <dt>提取器版本</dt>
            <dd>{diagnostics.selectorVersion}</dd>
          </div>
          {processed ? (
            <div>
              <dt>本次入库</dt>
              <dd>
                新增 {processed.added} / 已存在 {processed.duplicates} / 失败 {processed.failed}
              </dd>
            </div>
          ) : null}
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
          <p className="muted">未发现错误。</p>
        )}

        {scanLimited ? (
          <p className="hint">
            本次已达单次读取上限（{diagnostics.skipReasons['scan-limit']} 张未处理）。
            请滚动加载更多后再次点击读取，已读过的笔记不会重复入库。
          </p>
        ) : null}

        <div className="row">
          <Button onClick={() => void copyJson()}>{copied ? '已复制' : '复制诊断 JSON'}</Button>
        </div>
        <details style={{ marginTop: 8 }}>
          <summary>原始诊断 JSON</summary>
          <pre className="json">{json}</pre>
        </details>
      </section>

      <section className="card">
        <div className="row-between">
          <h2>笔记清单</h2>
          <span className="hint">{notes.length} 条</span>
        </div>
        {copies.length === 0 ? (
          <p className="hint">当前任务还没有关联文案。到管理页「任务」里勾选文案后，这里会出现「复制文案」。</p>
        ) : null}
        {loading ? <p className="muted">加载中…</p> : null}
        {!loading && notes.length === 0 ? (
          <p className="muted">
            还没有笔记。请确认当前页面是小红书搜索结果页，并已选择当前任务。
          </p>
        ) : null}
        {notes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            copies={copyChoices}
            selectedCopyId={selectedCopyId}
            onSelectCopy={onSelectCopy}
            taskId={taskId}
            onStatusChange={onStatusChange}
            onError={onError}
          />
        ))}
      </section>
    </>
  );
}
