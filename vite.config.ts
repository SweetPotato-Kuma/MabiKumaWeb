/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** 넥슨 오픈 API 원본 호스트. 개발 서버에서는 CORS 회피를 위해 프록시로 우회한다. */
const NEXON_API_ORIGIN = 'https://open.api.nexon.com';

/** GitHub Pages 프로젝트 사이트 경로. 레포지토리 이름이 바뀌면 이 값도 함께 바꾼다. */
const DEFAULT_BASE_PATH = '/MabiKumaWeb/';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: env.VITE_BASE_PATH || DEFAULT_BASE_PATH,
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        // 개발 중에는 /nexon-api/... 로 호출하면 브라우저 CORS 없이 넥슨 API에 도달한다.
        '/nexon-api': {
          target: NEXON_API_ORIGIN,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/nexon-api/, ''),
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  };
});
