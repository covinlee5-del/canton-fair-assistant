// 任务类目标签（PRD 流程 B 建议类别）

import { TaskCategory } from '../types/task';

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  [TaskCategory.CANTON_FAIR]: '广交会相关讨论',
  [TaskCategory.FOREIGN_BUYER]: '外商采购和商务交流',
  [TaskCategory.INTERPRETER]: '英语翻译需求',
  [TaskCategory.EXHIBITION_COMPANION]: '展会陪同需求',
  [TaskCategory.BUSINESS_RECEPTION]: '商务接待与沟通',
  [TaskCategory.OTHER]: '其他自定义场景',
};

export const TASK_CATEGORY_ORDER: TaskCategory[] = [
  TaskCategory.CANTON_FAIR,
  TaskCategory.FOREIGN_BUYER,
  TaskCategory.INTERPRETER,
  TaskCategory.EXHIBITION_COMPANION,
  TaskCategory.BUSINESS_RECEPTION,
  TaskCategory.OTHER,
];
