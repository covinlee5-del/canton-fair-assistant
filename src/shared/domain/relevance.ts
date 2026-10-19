// 阶段 4 相关性评分：纯函数，只使用任务配置和笔记可见字段。

import { presetKeywordsFor } from '../constants/keyword-presets';
import type { Note, RelevanceReason, RelevanceResult } from '../types/note';
import type { Task } from '../types/task';
import { normalizeText } from '../utils/text';
import { nowIso } from '../utils/time';

function containsKeyword(text: string, keyword: string): boolean {
  return text.toLocaleLowerCase().includes(normalizeText(keyword).toLocaleLowerCase());
}

function day(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed.getTime();
}

function levelFor(score: number, high: number, medium: number): RelevanceResult['level'] {
  if (score >= high) return 'high';
  if (score >= medium) return 'medium';
  return 'low';
}

export function calculateRelevance(note: Note, task: Task, evaluatedAt = nowIso()): RelevanceResult {
  const config = task.relevanceConfig;
  const title = normalizeText(note.title);
  const snippet = normalizeText(note.contentSnippet);
  const allText = `${title} ${snippet}`;
  const reasons: RelevanceReason[] = [];
  const matchedKeywords: string[] = [];
  let score = 0;

  for (const keyword of task.keywords) {
    const clean = normalizeText(keyword);
    if (!clean || !containsKeyword(allText, clean)) continue;
    matchedKeywords.push(clean);
    if (containsKeyword(title, clean)) {
      const delta = config.titleWeight * 10;
      score += delta;
      reasons.push({ rule: 'title-keyword', description: `标题包含“${clean}”`, scoreDelta: delta });
    } else {
      const delta = config.snippetWeight * 10;
      score += delta;
      reasons.push({ rule: 'snippet-keyword', description: `摘要包含“${clean}”`, scoreDelta: delta });
    }
  }

  const categoryKeywords = presetKeywordsFor(task.category);
  const categoryMatch = categoryKeywords.find((keyword) => containsKeyword(allText, keyword));
  if (categoryMatch) {
    score += config.categoryBonus;
    reasons.push({ rule: 'category-match', description: `内容命中“${categoryMatch}”场景词`, scoreDelta: config.categoryBonus });
  }

  for (const keyword of config.negativeKeywords) {
    const clean = normalizeText(keyword);
    if (!clean || !containsKeyword(allText, clean)) continue;
    score += config.negativeKeywordPenalty;
    reasons.push({ rule: 'negative-keyword', description: `内容命中排除词“${clean}”`, scoreDelta: config.negativeKeywordPenalty });
  }

  const publishedDay = day(note.publishedAt);
  const from = day(task.dateRange.from);
  const to = day(task.dateRange.to);
  if (publishedDay !== null && (from !== null || to !== null)) {
    const inRange = (from === null || publishedDay >= from) && (to === null || publishedDay <= to);
    const delta = inRange ? config.timeInRangeBonus : config.timeOutOfRangePenalty;
    score += delta;
    reasons.push({ rule: inRange ? 'time-in-range' : 'time-out-of-range', description: inRange ? '发布时间在目标范围内' : '发布时间不在目标范围内', scoreDelta: delta });
  }

  const bounded = Math.max(0, Math.min(100, score));
  return {
    taskId: task.id,
    score: bounded,
    level: levelFor(bounded, config.highThreshold, config.mediumThreshold),
    matchedKeywords: [...new Set(matchedKeywords)],
    reasons,
    evaluatedAt,
  };
}
