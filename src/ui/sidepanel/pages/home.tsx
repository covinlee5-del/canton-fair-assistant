import { useState } from 'react';
import { api } from '../../api';
import { openOptionsPage } from '../../../platform/side-panel';
import { useAsyncState } from '../../shared/hooks/useAsyncState';
import { Button } from '../../shared/components/Button';
import { ErrorBanner } from '../../shared/components/ErrorBanner';
import { toAppError, appError } from '../../../shared/utils/result';
import { ErrorCode } from '../../../shared/types/base';
import { TASK_CATEGORY_LABELS } from '../../../shared/constants/categories';
import type { AppError } from '../../../shared/types/base';
import { ReadResult } from './read-result';

export default function Home() {
  const dash = useAsyncState(() => api.dashboard(), []);
  const [reading, setReading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [actionError, setActionError] = useState<AppError | null>(null);

  const tasks = dash.data?.tasks ?? [];
  const currentTask = dash.data?.currentTask ?? null;

  async function handleRead(): Promise<void> {
    setActionError(null);
    setReading(true);
    try {
      const res = await api.readPage();
      if (res.ok) {
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
      setActionError(
        appError(
          ErrorCode.UNKNOWN_ERROR,
          '打开管理页失败',
          cause,
        ),
      );
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
          本阶段只做只读诊断，不会保存笔记，也不会向页面写入任何内容。
        </p>
        <div className="row">
          <Button
            variant="primary"
            onClick={() => void handleRead()}
            disabled={reading || !currentTask}
          >
            {reading ? '读取中…' : '读取当前页面诊断'}
          </Button>
          {!currentTask ? <span className="hint">需先选择当前任务</span> : null}
        </div>
        <ErrorBanner error={dash.error} />
        <ErrorBanner error={actionError} onRetry={() => void handleRead()} />
      </section>

      <ReadResult diagnostics={dash.data?.lastDiagnostics ?? null} />

      <p className="hint">数据仅保存在本地浏览器中，不会上传到任何服务器。</p>
    </div>
  );
}
