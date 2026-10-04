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
      /**
       * 개발용 .env 에 실제 워커 주소가 들어 있다. 테스트가 그걸 읽으면 화면을 그릴 때마다
       * 실서버에 카드를 물으러 나간다. 테스트는 워커가 없는 상태에서 돈다.
       */
      env: { VITE_PROXY_URL: '' },
      /**
       * 화면을 통째로 그리는 시험은 느린 기계에서 기본 5초를 넘긴다. 시험마다 하나씩 늘려 가다 보니 그때마다
       * 배포가 멈췄고, 파일마다 적어 둔 한도가 오히려 이 값보다 낮아지기도 했다. 한도는 여기 한 곳에서만 정하고
       * 테스트 파일에서 고치지 않는다. CI 에서 12초 걸리는 시험이 여러 배 느린 로컬에서도 넘치지 않게 넉넉히 둔다.
       * 비동기 기다림은 setup.ts 에서 늘린다. 진짜 멈춘 시험은 여기서도 잡힌다.
       */
      testTimeout: 60_000,
      hookTimeout: 30_000,
    },
  };
});
