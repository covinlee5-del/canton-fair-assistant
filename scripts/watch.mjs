// 开发监听：同时监听主构建与内容脚本构建。
// 用法：npm run dev —— 修改代码后，在 chrome://extensions 点击扩展的“重新加载”，
// 再重新打开侧边栏/管理页即可看到新代码。
import { build } from 'vite';

const configFiles = ['vite.config.ts', 'vite.content.config.ts'];
const watchers = [];

for (const configFile of configFiles) {
  // 依次启动：主构建先执行（清空 dist），内容脚本构建随后追加 content.js
  const watcher = await build({
    configFile,
    mode: 'development',
    build: { watch: {} },
  });
  watchers.push(watcher);
  console.log(`[dev] 已监听 ${configFile}`);
}

console.log('[dev] 监听中。修改后：chrome://extensions → 重新加载扩展 → 重新打开侧边栏/管理页。');
console.log('[dev] 按 Ctrl+C 退出。');

process.on('SIGINT', () => {
  for (const watcher of watchers) {
    watcher.close();
  }
  process.exit(0);
});
