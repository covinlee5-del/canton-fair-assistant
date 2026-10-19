import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useAsyncState } from '../../shared/hooks/useAsyncState';
import { Button } from '../../shared/components/Button';
import { StatusTag } from '../../shared/components/StatusTag';
import { ErrorBanner } from '../../shared/components/ErrorBanner';
import { NOTE_STATUS_LABELS } from '../../../shared/constants/statuses';
import { formatDate } from '../../../shared/utils/time';
import { truncateText } from '../../../shared/utils/text';
import { toAppError } from '../../../shared/utils/result';
import { copyNoteInfo, openNote } from '../../shared/note-actions';
import { copyPromotionalCopy } from '../../shared/note-actions';
import { NoteStatus } from '../../../shared/types/note';
import type { AppError } from '../../../shared/types/base';
import type { Note } from '../../../shared/types/note';
import type { PromotionalCopy } from '../../../shared/types/copy';

const STATUS_OPTIONS: Array<{ value: '' | NoteStatus; label: string }> = [
  { value: '', label: '全部状态' },
  { value: NoteStatus.NEW, label: NOTE_STATUS_LABELS[NoteStatus.NEW] },
  { value: NoteStatus.REVIEWED, label: NOTE_STATUS_LABELS[NoteStatus.REVIEWED] },
  { value: NoteStatus.MARKED_FOR_CONTACT, label: NOTE_STATUS_LABELS[NoteStatus.MARKED_FOR_CONTACT] },
  { value: NoteStatus.PROMOTED, label: NOTE_STATUS_LABELS[NoteStatus.PROMOTED] },
  { value: NoteStatus.REPLIED, label: NOTE_STATUS_LABELS[NoteStatus.REPLIED] },
  { value: NoteStatus.CONTACTED, label: NOTE_STATUS_LABELS[NoteStatus.CONTACTED] },
  { value: NoteStatus.IRRELEVANT, label: NOTE_STATUS_LABELS[NoteStatus.IRRELEVANT] },
];

/** 相关性分数筛选（对应 NotesListRequest.minScore，按当前任务视角的评分过滤） */
const SCORE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '全部评分' },
  { value: '50', label: '高相关（≥50 分）' },
  { value: '27', label: '中相关及以上（≥27 分）' },
  { value: '1', label: '已有评分（≥1 分）' },
];

function statusTone(status: NoteStatus): 'neutral' | 'info' | 'success' | 'warn' | 'danger' {
  if (status === NoteStatus.NEW) return 'info';
  if (status === NoteStatus.IRRELEVANT) return 'neutral';
  if (status === NoteStatus.REVIEWED) return 'warn';
  return 'success';
}

export default function Notes() {
  const tasksState = useAsyncState(() => api.taskList(true), []);
  const [taskId, setTaskId] = useState<string>('');
  const [status, setStatus] = useState<'' | NoteStatus>('');
  const [keyword, setKeyword] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<AppError | null>(null);
  /** 批量操作专用错误：只用于按钮旁的内联提示，避免把「打开笔记失败」等错误也显示成批量失败 */
  const [bulkError, setBulkError] = useState<AppError | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'relevance' | 'publishedAt' | 'updatedAt' | 'status'>('relevance');
  const [scoreFilter, setScoreFilter] = useState<string>('');
  const [selected, setSelected] = useState<string[]>([]);
  const [copies, setCopies] = useState<PromotionalCopy[]>([]);
  const [copyId, setCopyId] = useState('');

  const tasks = tasksState.data ?? [];
  const activeTask = tasks.find((task) => task.id === taskId) ?? null;
  const taskCopies = activeTask ? copies.filter((copy) => activeTask.copyIds.includes(copy.id)) : copies;
  const activeCopy = taskCopies.find((copy) => copy.id === copyId) ?? taskCopies.find((copy) => copy.isDefault) ?? taskCopies[0] ?? null;

  useEffect(() => { api.copiesList().then((result) => { if (result.ok) setCopies(result.value); }); }, []);

  // 筛选条件变化时重新查询（本地 IndexedDB，无网络请求）
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .notesList({
        taskId: taskId === '' ? null : taskId,
        status: status === '' ? null : status,
        keyword: keyword.trim() === '' ? null : keyword.trim(),
        sortBy,
        sortOrder: 'desc',
        minScore: scoreFilter === '' ? null : Number(scoreFilter),
      })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setNotes(res.value);
          setActionError(null);
        } else {
          setActionError(res.error);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setActionError(toAppError(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, status, keyword, sortBy, scoreFilter]);

  async function scoreTask(): Promise<void> {
    if (!taskId) return;
    const result = await api.notesScoreTask(taskId);
    if (result.ok) setNotes(result.value); else setActionError(result.error);
  }

  /** 改选时清掉上一次的批量报错，避免用户改完还看到「刚才那条不行」的旧提示 */
  function updateSelection(next: string[]): void {
    setSelected(next);
    setBulkError(null);
  }

  async function bulkStatus(next: NoteStatus): Promise<void> {
    if (selected.length === 0) return;
    setActionError(null);
    setBulkError(null);
    try {
      const result = await api.notesBulkSetStatus(selected, next, taskId || null);
      if (result.ok) {
        setSelected([]);
        setNotes((current) =>
          current.map((note) => result.value.find((item) => item.id === note.id) ?? note),
        );
      } else {
        // 批量是「全有或全无」：任何一条非法转移都会整体拒绝，并保持原状态不变
        setActionError(result.error);
        setBulkError(result.error);
      }
    } catch (cause) {
      const error = toAppError(cause);
      setActionError(error);
      setBulkError(error);
    }
  }

  async function handleStatus(note: Note, next: NoteStatus): Promise<void> {
    setActionError(null);
    try {
      const res = await api.noteSetStatus(note.id, next, taskId === '' ? null : taskId);
      if (res.ok) {
        setNotes((prev) => prev.map((n) => (n.id === note.id ? res.value : n)));
      } else {
        setActionError(res.error);
      }
    } catch (cause) {
      setActionError(toAppError(cause));
    }
  }

  async function handleCopy(note: Note): Promise<void> {
    const res = await copyNoteInfo(note, taskId || null);
    if (!res.ok) {
      setActionError(res.error);
      return;
    }
    setCopiedId(note.id);
    window.setTimeout(() => setCopiedId(null), 1500);
  }

  async function handleOpen(note: Note): Promise<void> {
    const res = await openNote(note, taskId || null);
    if (!res.ok) setActionError(res.error);
  }

  async function handleCopyPromotion(note: Note): Promise<void> {
    if (!activeCopy) return;
    const res = await copyPromotionalCopy(note, activeCopy.content, activeCopy.id, taskId || null);
    if (!res.ok) setActionError(res.error);
    else setCopiedId(note.id);
  }

  return (
    <div>
      <div className="row-between">
        <h2>笔记列表</h2>
        <span className="hint">{notes.length} 条</span>
      </div>
      <p className="hint">
        笔记来自你自己在小红书搜索结果页点击“读取当前页面笔记”的结果。相同笔记只保留一条，
        重复读取不会产生重复记录。
      </p>

      <ErrorBanner error={tasksState.error} />
      <ErrorBanner error={actionError} />

      <div className="card">
        <div className="row">
          <label className="hint" htmlFor="note-filter-task">
            任务
          </label>
          <select
            id="note-filter-task"
            className="select"
            style={{ width: 'auto' }}
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
          >
            <option value="">全部任务</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <label className="hint" htmlFor="note-filter-status">
            状态
          </label>
          <select
            id="note-filter-status"
            className="select"
            style={{ width: 'auto' }}
            value={status}
            onChange={(e) => setStatus(e.target.value as '' | NoteStatus)}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <input
            className="input"
            style={{ width: 200 }}
            placeholder="搜索标题/作者/摘要"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            aria-label="关键词过滤"
          />
          <label htmlFor="note-sort">排序</label>
          <select id="note-sort" className="select" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            <option value="relevance">相关性</option><option value="publishedAt">发布时间</option><option value="updatedAt">更新时间</option><option value="status">状态</option>
          </select>
          <label htmlFor="note-score">评分</label>
          <select id="note-score" className="select" value={scoreFilter} onChange={(e) => setScoreFilter(e.target.value)}>
            {SCORE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <Button onClick={() => void scoreTask()} disabled={!taskId}>重新评分当前任务</Button>
          <label htmlFor="note-copy">文案</label>
          <select id="note-copy" className="select" value={activeCopy?.id ?? ''} onChange={(e) => setCopyId(e.target.value)} disabled={taskCopies.length === 0}>
            {taskCopies.length === 0 ? <option value="">当前任务未关联文案</option> : taskCopies.map((copy) => <option key={copy.id} value={copy.id}>{copy.name}{copy.isDefault ? '（默认）' : ''}</option>)}
          </select>
        </div>
        {selected.length > 0 ? <div className="row"><span className="hint">已选 {selected.length} 条</span><Button onClick={() => void bulkStatus(NoteStatus.REVIEWED)}>批量标为已审核</Button><Button variant="danger" onClick={() => void bulkStatus(NoteStatus.IRRELEVANT)}>批量标为不相关</Button></div> : null}
        {/* 批量操作是「全有或全无」，失败原因必须在操作按钮旁边可见，不能只在页面顶部。
            用 bulkError 而非 actionError：只显示批量失败，不会把「打开笔记失败」也显示成批量失败。
            文案已由服务层写成完整句子（含「哪几条、为什么」），这里不再拼接，避免出现「。。」 */}
        {selected.length > 0 && bulkError ? (
          <p className="hint" role="alert" style={{ color: 'var(--danger)' }}>
            {bulkError.message}
          </p>
        ) : null}
      </div>

      {loading ? <p className="muted">加载中…</p> : null}

      {!loading && notes.length === 0 ? (
        <div className="empty-state">
          还没有符合条件的笔记。请在侧边栏打开小红书搜索结果页并点击“读取当前页面笔记”。
        </div>
      ) : null}

      {notes.length > 0 ? (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="全选当前列表" checked={notes.length > 0 && selected.length === notes.length} onChange={(e) => updateSelection(e.target.checked ? notes.map((note) => note.id) : [])} /></th>
                <th>标题</th>
                <th>作者</th>
                <th>时间</th>
                <th>摘要</th>
                <th>状态</th>
                <th>相关性</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((note) => (
                <tr key={note.id}>
                  <td><input type="checkbox" aria-label={`选择${note.title}`} checked={selected.includes(note.id)} onChange={(e) => updateSelection(e.target.checked ? [...selected, note.id] : selected.filter((id) => id !== note.id))} /></td>
                  <td title={note.title}>{truncateText(note.title, 40)}</td>
                  <td>{note.authorDisplayName ?? '—'}</td>
                  <td>{note.publishedAt ? formatDate(note.publishedAt) : (note.publishedAtRaw ?? '—')}</td>
                  <td title={note.contentSnippet ?? ''}>
                    {note.contentSnippet ? truncateText(note.contentSnippet, 40) : '—'}
                  </td>
                  <td>
                    <StatusTag label={NOTE_STATUS_LABELS[note.status]} tone={statusTone(note.status)} />
                  </td>
                  <td title={note.relevance.reasons.map((reason) => reason.description).join('；')}>{note.relevance.reasons.length > 0 ? `${note.relevance.score} 分 · ${note.relevance.level}` : '未评分'}</td>
                  <td>
                    <Button onClick={() => void handleOpen(note)}>打开笔记</Button>
                    <Button
                      onClick={() => void handleCopy(note)}
                      title="复制笔记标题、作者、时间与链接"
                    >
                      {copiedId === note.id ? '已复制' : '复制笔记信息'}
                    </Button>
                    <Button onClick={() => void handleCopyPromotion(note)} disabled={!activeCopy} title={activeCopy?.name ?? '请先在任务中关联文案'}>复制文案</Button>
                    {note.status === NoteStatus.NEW ? (
                      <Button onClick={() => void handleStatus(note, NoteStatus.REVIEWED)}>
                        标为已审核
                      </Button>
                    ) : null}
                    {note.status === NoteStatus.REVIEWED ? (
                      <Button
                        onClick={() => void handleStatus(note, NoteStatus.MARKED_FOR_CONTACT)}
                      >
                        标为待联系
                      </Button>
                    ) : null}
                    {note.status === NoteStatus.MARKED_FOR_CONTACT ? <Button onClick={() => void handleStatus(note, NoteStatus.PROMOTED)}>标记已推广</Button> : null}
                    {note.status === NoteStatus.PROMOTED ? <Button onClick={() => void handleStatus(note, NoteStatus.REPLIED)}>标记已回复</Button> : null}
                    {note.status === NoteStatus.REPLIED ? <Button onClick={() => void handleStatus(note, NoteStatus.CONTACTED)}>标记已联系</Button> : null}
                    {note.status === NoteStatus.NEW || note.status === NoteStatus.REVIEWED ? (
                      <Button
                        variant="danger"
                        onClick={() => void handleStatus(note, NoteStatus.IRRELEVANT)}
                      >
                        标为不相关
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
