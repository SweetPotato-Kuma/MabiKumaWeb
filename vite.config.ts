/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** 넥슨 오픈 API 원본 호스트. 개발 서버에서는 CORS 회피를 위해 프록시로 우회한다. */
const NEXON_API_ORIGIN = 'https://open.api.nexon.com';

/** 배포 경로. 커스텀 도메인(mabi.spkuma.com) 루트에 올리므로 "/" 다. github.io 하위 경로로 돌아가면 "/<repo>/" 로 바꾼다. */
const DEFAULT_BASE_PATH = '/';

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
      rollupOptions: {
        output: {
          /**
           * antd 가 번들의 대부분이다. 앱 코드와 한 덩어리로 두면 화면을 한 줄 고칠 때마다
           * 방문자가 라이브러리까지 다시 받는다. 잘 안 바뀌는 것끼리 따로 묶어 캐시를 살린다.
           */
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            antd: ['antd', '@ant-design/icons'],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  };
});
