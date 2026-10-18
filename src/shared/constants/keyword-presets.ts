// 初始关键词库（PRD 7.3）
// 仅作为初始模板，不代表这些关键词一定能在小红书搜索到内容。用户可随时增删改。

import { TaskCategory } from '../types/task';

export const KEYWORD_PRESETS: Record<Exclude<TaskCategory, TaskCategory.OTHER>, string[]> = {
  [TaskCategory.CANTON_FAIR]: [
    '广交会',
    'Canton Fair',
    'China Import and Export Fair',
    'Guangzhou trade fair',
  ],
  [TaskCategory.FOREIGN_BUYER]: [
    '外商采购',
    'foreign buyer',
    'sourcing in China',
    'business meeting',
    'business matching',
  ],
  [TaskCategory.INTERPRETER]: [
    '英语翻译',
    '展会翻译',
    '商务陪同',
    'interpreter',
    'exhibition interpreter',
  ],
  [TaskCategory.EXHIBITION_COMPANION]: [
    '展会陪同',
    '广交会陪同',
    'trade show companion',
    'fair escort',
  ],
  [TaskCategory.BUSINESS_RECEPTION]: [
    '商务接待',
    '商务沟通',
    'business reception',
    'networking',
  ],
};

/** 按类目取预设关键词；OTHER 返回空数组 */
export function presetKeywordsFor(category: TaskCategory): string[] {
  if (category === TaskCategory.OTHER) return [];
  return [...(KEYWORD_PRESETS[category] ?? [])];
}
