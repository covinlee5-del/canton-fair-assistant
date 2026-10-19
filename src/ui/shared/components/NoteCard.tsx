import { useState } from 'react';
import { Button } from './Button';
import { StatusTag } from './StatusTag';
import { NOTE_STATUS_LABELS } from '../../../shared/constants/statuses';
import { NoteStatus } from '../../../shared/types/note';
import { formatDate } from '../../../shared/utils/time';
import { truncateText } from '../../../shared/utils/text';
import { copyNoteInfo, copyPromotionalCopy, openNote } from '../note-actions';
import type { AppError } from '../../../shared/types/base';
import type { Note } from '../../../shared/types/note';

/** 可复制到剪贴板的宣传文案（侧边栏只需要内容与名称，不需要完整文案模型） */
export interface CopyChoice {
  id: string;
  name: string;
  content: string;
}

interface NoteCardProps {
  note: Note;
  /** 当前任务可用的文案；为空时不显示「复制文案」入口 */
  copies?: CopyChoice[];
  /** 当前选中的文案（由父组件管理，保证同一笔记列表内选择一致） */
  selectedCopyId?: string;
  onSelectCopy?: (copyId: string) => void;
  /** 从哪个任务视角记录活动 */
  taskId?: string | null;
  /** 可选：状态标记回调（不传则不显示状态操作） */
  onStatusChange?: (note: Note, status: Note['status']) => void;
  onError?: (error: AppError) => void;
}

/** 侧边栏用的紧凑笔记卡片：标题 / 作者 / 时间 / 摘要截断 + 打开、复制与手动状态标记 */
export function NoteCard({
  note,
  copies = [],
  selectedCopyId,
  onSelectCopy,
  taskId = null,
  onStatusChange,
  onError,
}: NoteCardProps) {
  const [copied, setCopied] = useState<'info' | 'promo' | null>(null);

  const timeLabel = note.publishedAt ? formatDate(note.publishedAt) : (note.publishedAtRaw ?? '时间未知');
  const snippet = note.contentSnippet ? truncateText(note.contentSnippet, 60) : null;
  const activeCopy = copies.find((copy) => copy.id === selectedCopyId) ?? copies[0] ?? null;

  async function handleOpen(): Promise<void> {
    const res = await openNote(note, taskId);
    if (!res.ok) onError?.(res.error);
  }

  async function handleCopy(): Promise<void> {
    const res = await copyNoteInfo(note, taskId);
    if (!res.ok) {
      onError?.(res.error);
      return;
    }
    setCopied('info');
    window.setTimeout(() => setCopied(null), 1500);
  }

  async function handleCopyPromotion(): Promise<void> {
    if (!activeCopy) return;
    const res = await copyPromotionalCopy(note, activeCopy.content, activeCopy.id, taskId);
    if (!res.ok) {
      onError?.(res.error);
      return;
    }
    setCopied('promo');
    window.setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="note-card">
      <div className="note-card-title" title={note.title}>
        {note.title || '（无标题）'}
      </div>
      <div className="note-card-meta">
        <span>{note.authorDisplayName ?? '作者未知'}</span>
        <span>·</span>
        <span>{timeLabel}</span>
        <StatusTag
          label={NOTE_STATUS_LABELS[note.status]}
          tone={note.status === 'IRRELEVANT' ? 'neutral' : note.status === 'NEW' ? 'info' : 'success'}
        />
        {note.relevance.reasons.length > 0 ? (
          <span title={note.relevance.reasons.map((reason) => reason.description).join('；')}>
            {note.relevance.score} 分
          </span>
        ) : <span>未评分</span>}
      </div>
      {snippet ? <p className="note-card-snippet">{snippet}</p> : null}

      {copies.length > 0 && activeCopy ? (
        <div className="row" style={{ marginBottom: 6 }}>
          {copies.length > 1 && onSelectCopy ? (
            <select
              className="select"
              style={{ width: 'auto' }}
              aria-label={`为「${note.title || '该笔记'}」选择文案`}
              value={activeCopy.id}
              onChange={(e) => onSelectCopy(e.target.value)}
            >
              {copies.map((copy) => (
                <option key={copy.id} value={copy.id}>
                  {copy.name}
                </option>
              ))}
            </select>
          ) : null}
          <Button onClick={() => void handleCopyPromotion()} title={`复制文案：${activeCopy.name}`}>
            {copied === 'promo' ? '已复制文案' : '复制文案'}
          </Button>
        </div>
      ) : null}

      <div className="row">
        <Button onClick={() => void handleOpen()}>打开笔记</Button>
        <Button onClick={() => void handleCopy()} title="复制标题、作者、时间与链接">
          {copied === 'info' ? '已复制' : '复制笔记信息'}
        </Button>
        {onStatusChange ? (
          <>
            {note.status === NoteStatus.NEW ? (
              <Button onClick={() => onStatusChange(note, NoteStatus.REVIEWED)}>标为已审核</Button>
            ) : null}
            {note.status === NoteStatus.NEW || note.status === NoteStatus.REVIEWED ? (
              <Button variant="danger" onClick={() => onStatusChange(note, NoteStatus.IRRELEVANT)}>
                标为不相关
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
