import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 主构建：侧边栏 + 管理页 + Service Worker（ES module）。
// 说明：不引入 @crxjs/vite-plugin，采用手工多入口配置（决策见 docs/02 §4）。
// 构建顺序：先本配置（emptyOutDir 清空 dist），再 vite.content.config.ts 追加 content.js。
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: 'sidepanel.html',
        options: 'options.html',
        background: 'src/background/index.ts',
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
