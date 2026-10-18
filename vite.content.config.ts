import { defineConfig } from 'vite';

// 内容脚本构建：单文件 IIFE 输出 dist/content.js。
// 通过 chrome.scripting.executeScript({ files: ['content.js'] }) 按需注入，
// 内容脚本不支持 ES module，因此必须打包为 IIFE 且不产生拆分 chunk。
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/content/index.ts',
      name: 'CantonFairContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    minify: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
