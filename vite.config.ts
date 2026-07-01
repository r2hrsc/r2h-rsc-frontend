import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// Plugin to inject AdSense script + meta tag into built HTML
// Vite strips external async scripts during build, so we re-inject them post-build
function adsenseInjector() {
  const adsenseScript = '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2034144866447223" crossorigin="anonymous"></script>';
  const adsenseMeta = '<meta name="google-adsense-account" content="ca-pub-2034144866447223">';

  return {
    name: 'adsense-injector',
    transformIndexHtml(html: string) {
      // Insert before </head>
      return html.replace('</head>', `    ${adsenseMeta}\n    ${adsenseScript}\n  </head>`);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    adsenseInjector(),
    nodePolyfills({
      include: ['buffer', 'process', 'stream', 'util', 'crypto'],
      globals: { Buffer: true, process: true },
    }),
  ],
  define: {
    global: 'globalThis',
  },
  server: {
    port: 5173,
    host: true,
  },
});
