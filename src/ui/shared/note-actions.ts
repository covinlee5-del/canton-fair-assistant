// 笔记操作（打开 / 复制信息 / 复制宣传文案）
//
// 红线：所有操作都由用户点击触发；不自动打开、不自动粘贴到任何页面。
// 「复制」只写系统剪贴板，不向小红书页面写入任何内容。
//
// 活动记录是「附带记账」，不是操作本身：记账失败不得让已成功的打开/复制显示为失败
// （用户看到「复制失败」但内容其实已在剪贴板，会误导重做）。因此记账失败只静默忽略，
// 不影响主操作结果。

import { openTab } from '../../platform/tabs';
import { appError, fail, ok } from '../../shared/utils/result';
import { ErrorCode } from '../../shared/types/base';
import { formatDate } from '../../shared/utils/time';
import type { Result } from '../../shared/types/base';
import type { Note } from '../../shared/types/note';
import { api } from '../api';

/** 记账失败时静默忽略（主操作已成功） */
async function recordQuietly(input: {
  noteId: string;
  taskId?: string | null;
  action: 'OPEN_NOTE' | 'COPY_TEXT';
  copyId?: string;
}): Promise<void> {
  try {
    await api.recordActivity(input);
  } catch {
    // 活动记录失败不影响主操作
  }
}

/**
 * 打开笔记时实际使用的链接。
 *
 * 优先用 openUrl（带 xsec_token 等授权参数）：只用 canonicalUrl 会让新标签页
 * 落到「请打开小红书App扫码查看」。旧数据没有 openUrl 时才回退。
 */
export function resolveNoteOpenUrl(note: Note): string | null {
  for (const candidate of [note.openUrl ?? null, note.canonicalUrl]) {
    if (candidate && candidate.trim().length > 0) return candidate;
  }
  return null;
}

/** 在新标签页打开笔记（用户主动点击） */
export async function openNote(note: Note, taskId: string | null = null): Promise<Result<void>> {
  const target = resolveNoteOpenUrl(note);
  if (!target) {
    return fail(appError(ErrorCode.INVALID_INPUT, '该笔记没有可打开的链接'));
  }
  try {
    await openTab(target);
  } catch (cause) {
    return fail(appError(ErrorCode.UNKNOWN_ERROR, '打开笔记失败', cause));
  }
  await recordQuietly({ noteId: note.id, taskId, action: 'OPEN_NOTE' });
  return ok(undefined);
}

/**
 * 笔记信息的可粘贴文本（标题 / 作者 / 时间 / 链接）。
 *
 * 这里刻意写 canonicalUrl 而不是 openUrl：文本可能被粘贴到别处，
 * 不带授权参数更安全；需要打开时请用「打开笔记」按钮。
 */
export function buildNoteClipboardText(note: Note): string {
  const lines: string[] = [];
  if (note.title) lines.push(note.title);
  const meta: string[] = [];
  if (note.authorDisplayName) meta.push(`作者：${note.authorDisplayName}`);
  const time = note.publishedAt ? formatDate(note.publishedAt) : note.publishedAtRaw;
  if (time) meta.push(`时间：${time}`);
  if (meta.length > 0) lines.push(meta.join(' · '));
  if (note.canonicalUrl) lines.push(note.canonicalUrl);
  return lines.join('\n');
}

/**
 * 复制笔记信息到剪贴板。
 * 只复制「笔记自身可见信息」；宣传文案由 copyPromotionalCopy 单独处理。
 */
export async function copyNoteInfo(
  note: Note,
  taskId: string | null = null,
): Promise<Result<void>> {
  try {
    await navigator.clipboard.writeText(buildNoteClipboardText(note));
  } catch (cause) {
    return fail(appError(ErrorCode.UNKNOWN_ERROR, '复制失败，请检查剪贴板权限', cause));
  }
  await recordQuietly({ noteId: note.id, taskId, action: 'COPY_TEXT' });
  return ok(undefined);
}

/** 复制宣传文案到剪贴板（文案本身不写入页面，只进剪贴板） */
export async function copyPromotionalCopy(
  note: Note,
  content: string,
  copyId: string,
  taskId: string | null,
): Promise<Result<void>> {
  try {
    await navigator.clipboard.writeText(content);
  } catch (cause) {
    return fail(appError(ErrorCode.UNKNOWN_ERROR, '复制文案失败，请检查剪贴板权限', cause));
  }
  await recordQuietly({ noteId: note.id, taskId, action: 'COPY_TEXT', copyId });
  return ok(undefined);
}
