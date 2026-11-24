import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'macnotes-production-csp',
      apply: 'build',
      transformIndexHtml(html) {
        const csp = [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: freenotes-asset:",
          "font-src 'self' data:",
          "media-src 'self' data: blob:",
          "connect-src 'self'",
          "object-src 'none'",
          "base-uri 'none'",
          "form-action 'none'",
        ].join('; ');
        return html.replace(
          '</head>',
          `    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n  </head>`,
        );
      },
    },
  ],
  build: {
    outDir: 'dist-renderer',
    emptyOutDir: true,
    target: 'chrome140',
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});
