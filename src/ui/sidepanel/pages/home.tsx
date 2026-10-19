import { useEffect, useState } from 'react';
import { api } from '../../api';
import { openOptionsPage } from '../../../platform/side-panel';
import { useAsyncState } from '../../shared/hooks/useAsyncState';
import { Button } from '../../shared/components/Button';
import { ErrorBanner } from '../../shared/components/ErrorBanner';
import { toAppError, appError } from '../../../shared/utils/result';
import { ErrorCode } from '../../../shared/types/base';
import { TASK_CATEGORY_LABELS } from '../../../shared/constants/categories';
import type { AppError } from '../../../shared/types/base';
import type { Note, NoteStatus } from '../../../shared/types/note';
import type { PromotionalCopy } from '../../../shared/types/copy';
import type { ReadPageProcessed } from '../../../shared/types/extraction';
import { ReadResult } from './read-result';

export default function Home() {
  const dash = useAsyncState(() => api.dashboard(), []);
  const [reading, setReading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [actionError, setActionError] = useState<AppError | null>(null);
  const [processed, setProcessed] = useState<ReadPageProcessed | null>(null);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [copies, setCopies] = useState<PromotionalCopy[]>([]);
  const [selectedCopyId, setSelectedCopyId] = useState<string>('');

  const tasks = dash.data?.tasks ?? [];
  const currentTask = dash.data?.currentTask ?? null;
  const currentTaskId = currentTask?.id ?? null;
  // 任务切换后只展示该任务关联的文案，避免跨任务混用文案（docs/11 §5）
  const taskCopies = currentTask
    ? copies.filter((copy) => currentTask.copyIds.includes(copy.id))
    : [];

  useEffect(() => {
    let cancelled = false;
    api
      .copiesList()
      .then((result) => {
        if (!cancelled && result.ok) setCopies(result.value);
      })
      .catch(() => {
        // 文案读取失败不阻塞主流程；复制文案入口自动隐藏
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 选定文案：保持用户选择；所选文案不在当前任务范围内时退回默认/第一条
  useEffect(() => {
    if (taskCopies.length === 0) {
      if (selectedCopyId !== '') setSelectedCopyId('');
      return;
    }
    const stillAvailable = taskCopies.some((copy) => copy.id === selectedCopyId);
    if (!stillAvailable) {
      const fallback = taskCopies.find((copy) => copy.isDefault) ?? taskCopies[0];
      setSelectedCopyId(fallback?.id ?? '');
    }
  }, [taskCopies, selectedCopyId]);

  // 载入「当前任务视角」的已存笔记（切任务或读取后刷新）
  useEffect(() => {
    let cancelled = false;
    setNotesLoading(true);
    api
      .notesList({ taskId: currentTaskId })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setNotes(res.value);
        else setActionError(res.error);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setActionError(toAppError(cause));
      })
      .finally(() => {
        if (!cancelled) setNotesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentTaskId, dash.data?.noteCount]);

  async function handleRead(): Promise<void> {
    setActionError(null);
    setReading(true);
    try {
      const res = await api.readPage();
      if (res.ok) {
        setProcessed(res.value.processed);
        setNotes(res.value.notes);
        dash.reload();
      } else {
        setActionError(res.error);
      }
    } catch (cause) {
      setActionError(toAppError(cause));
    } finally {
      setReading(false);
    }
  }

  async function handleStatusChange(note: Note, status: NoteStatus): Promise<void> {
    setActionError(null);
    try {
      const res = await api.noteSetStatus(note.id, status, currentTaskId);
      if (res.ok) {
        setNotes((prev) =>
          (prev ?? []).map((n) => (n.id === note.id ? res.value : n)),
        );
      } else {
        setActionError(res.error);
      }
    } catch (cause) {
      setActionError(toAppError(cause));
    }
  }

  async function handleTaskChange(taskId: string): Promise<void> {
    setSwitching(true);
    setActionError(null);
    try {
      const res = await api.setDefaultTask(taskId === '' ? null : taskId);
      if (res.ok) {
        dash.reload();
      } else {
        setActionError(res.error);
      }
    } catch (cause) {
      setActionError(toAppError(cause));
    } finally {
      setSwitching(false);
    }
  }

  async function handleOpenManager(): Promise<void> {
    try {
      await openOptionsPage();
    } catch (cause) {
      setActionError(appError(ErrorCode.UNKNOWN_ERROR, '打开管理页失败', cause));
    }
  }

  return (
    <div className="page">
      <section className="card">
        <div className="row-between">
          <h2>当前任务</h2>
          <span className="hint">{tasks.length} 个任务</span>
        </div>
        {tasks.length === 0 ? (
          <p className="muted">还没有任务。请先在管理页创建任务，再回到这里读取页面。</p>
        ) : (
          <select
            className="select"
            value={currentTask?.id ?? ''}
            disabled={switching}
            onChange={(e) => void handleTaskChange(e.target.value)}
          >
            <option value="">（未选择任务）</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        {currentTask ? (
          <dl className="diag-summary" style={{ marginTop: 8 }}>
            <div>
              <dt>类别</dt>
              <dd>{TASK_CATEGORY_LABELS[currentTask.category]}</dd>
            </div>
            <div>
              <dt>关键词</dt>
              <dd>{currentTask.keywords.length} 个</dd>
            </div>
            <div>
              <dt>已记录笔记</dt>
              <dd>{dash.data?.noteCount ?? 0} 条</dd>
            </div>
          </dl>
        ) : null}
        <div className="row" style={{ marginTop: 8 }}>
          <Button onClick={() => void handleOpenManager()}>打开管理页</Button>
        </div>
      </section>

      <section className="card">
        <h2>读取当前页面</h2>
        <p className="hint">
          请先在浏览器中正常打开小红书搜索结果页并等待内容加载，然后点击下方按钮。
          插件只读取当前可见的笔记卡片（标题、作者、时间、摘要），不会滚动、翻页或点击任何东西。
        </p>
        <div className="row">
          <Button
            variant="primary"
            onClick={() => void handleRead()}
            disabled={reading || !currentTask}
          >
            {reading ? '读取中…' : '读取当前页面笔记'}
          </Button>
          {!currentTask ? <span className="hint">需先选择当前任务</span> : null}
        </div>
        <ErrorBanner error={dash.error} />
        <ErrorBanner error={actionError} onRetry={() => void handleRead()} />
      </section>

      <ReadResult
        diagnostics={dash.data?.lastDiagnostics ?? null}
        notes={notes ?? []}
        processed={processed}
        loading={notesLoading}
        copies={taskCopies}
        selectedCopyId={selectedCopyId}
        onSelectCopy={setSelectedCopyId}
        taskId={currentTaskId}
        onStatusChange={(note, status) => void handleStatusChange(note, status)}
        onError={setActionError}
      />

      <p className="hint">数据仅保存在本地浏览器中，不会上传到任何服务器。</p>
    </div>
  );
}
