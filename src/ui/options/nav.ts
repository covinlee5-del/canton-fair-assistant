export const NAV_ITEMS = [
  { key: 'dashboard', label: '首页' },
  { key: 'tasks', label: '任务' },
  { key: 'notes', label: '笔记' },
  { key: 'copy', label: '文案' },
  { key: 'stats', label: '统计' },
  { key: 'settings', label: '设置' },
] as const;

export type NavKey = (typeof NAV_ITEMS)[number]['key'];
