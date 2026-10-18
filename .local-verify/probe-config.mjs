export default {
  esbuild: false,
  logLevel: 'info',
  build: {
    outDir: '.local-verify/probe-out',
    emptyOutDir: true,
    minify: false,
    cssMinify: false,
    lib: {
      entry: '.local-verify/probe/entry.js',
      formats: ['iife'],
      name: 'Probe',
      fileName: () => 'probe.js',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
};
