// 读取当前页面命令（阶段 3：只读提取 → 去重 → 落库 → 返回清单）
//
// 权限依据：host_permissions 站点权限（阶段 2 验收后改判，见 docs/02 §6）。
// 语义：读取即落库；返回值同时包含诊断与「当前任务视角」的笔记清单。
// 红线：不滚动、不翻页、不点击、不请求任何网络接口。

import { register } from '../message-router';
import { Message } from '../../messaging/messages';
import { getActiveTab } from '../../platform/tabs';
import { executeContentScript } from '../../platform/scripting';
import { storageSet } from '../../platform/storage';
import { STORAGE_KEYS } from '../../shared/constants/storage-keys';
import { parsePageUrl, toPrivacySafePageUrl } from '../../shared/domain/normalization';
import { appError, appErrorWithMessage, storageError } from '../../shared/utils/result';
import { ErrorCode } from '../../shared/types/base';
import { parseXhsTime } from '../../shared/utils/time';
import { NoteRepository } from '../../data/note-repository';
import { TaskRepository } from '../../data/task-repository';
import { LocalSettingsRepository } from '../../data/settings-repository';
import { listNotes, saveNoteDrafts } from '../../services/note-service';
import { scoreNotesForTask } from '../../services/relevance-service';
import type { ReadPageResponse } from '../../shared/types/extraction';
import type { Note } from '../../shared/types/note';

async function readCurrentPage(): Promise<ReadPageResponse> {
  const tab = await getActiveTab();
  if (!tab || tab.id == null) {
    throw appError(ErrorCode.PERMISSION_DENIED, '无法获取当前标签页');
  }
  // 站点权限缺失/未授权时 tab.url 不可读。此时无法判断是不是小红书，
  // 但绝大多数情况就是「用户停在了别的网站上」——文案要往这个方向说，
  // 否则用户会以为是自己点了什么才坏了（真实复验中确实被这样误解过）。
  if (!tab.url) {
    throw appErrorWithMessage(
      ErrorCode.UNSUPPORTED_PAGE,
      '无法读取当前页面地址。最常见的原因是：当前标签页不是小红书（其它网站不授予本插件读取权限）。' +
        '请切换到小红书搜索结果页后重试；若你确认当前就是小红书页面，请点一下该页面再点扩展图标。',
      'tab.url unavailable (host permission not granted)',
    );
  }
  const parsed = parsePageUrl(tab.url);
  if (!parsed || !parsed.isXiaohongshu) {
    throw appError(ErrorCode.UNSUPPORTED_PAGE, `host=${parsed?.host ?? 'unknown'}`);
  }

  let payload: Awaited<ReturnType<typeof executeContentScript>>;
  try {
    payload = await executeContentScript(tab.id);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw appError(ErrorCode.PERMISSION_DENIED, `注入失败: ${detail}`, cause);
  }

  const { diagnostics, drafts } = payload;

  // 当前任务：用于把本次读取到的笔记关联到任务
  const settingsRepo = new LocalSettingsRepository();
  const settingsResult = await settingsRepo.get();
  const taskId = settingsResult.ok ? settingsResult.value.defaultTaskId : null;

  const noteRepo = new NoteRepository();
  const saved = await saveNoteDrafts(
    noteRepo,
    drafts,
    {
      taskId,
      sourcePageUrl: toPrivacySafePageUrl(tab.url) ?? 'unknown',
    },
    (raw) => parseXhsTime(raw).iso,
  );
  if (!saved.ok) throw saved.error;

  if (taskId) {
    const task = await new TaskRepository().getById(taskId);
    if (!task.ok) throw task.error;
    if (task.value) {
      const scored = await scoreNotesForTask(noteRepo, saved.value.notes, task.value);
      if (!scored.ok) throw scored.error;
    }
  }

  // 返回「当前任务视角」的完整清单（含历史记录），供侧边栏与管理页直接展示
  let notes: Note[] = saved.value.notes;
  if (taskId) {
    const listed = await listNotes(noteRepo, { taskId });
    if (!listed.ok) throw listed.error;
    notes = listed.value;
  }

  try {
    await storageSet(STORAGE_KEYS.lastDiagnostics, diagnostics);
  } catch (cause) {
    throw storageError('保存诊断结果失败', cause);
  }

  return {
    diagnostics,
    notes,
    processed: saved.value.processed,
  };
}

export function registerReadPageCommand(): void {
  // 处理器返回纯值；失败以抛错形式交给路由器包装为信封
  register(Message.READ_PAGE, () => readCurrentPage());
}
