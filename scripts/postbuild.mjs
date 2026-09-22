import { copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const distDir = resolve(process.cwd(), 'dist');

// GitHub Pages 는 SPA 라우팅을 모르므로, 없는 경로는 404.html 로 떨어진다.
// index.html 을 그대로 복사해두면 새로고침/직접 진입에서도 앱이 뜬다.
await copyFile(resolve(distDir, 'index.html'), resolve(distDir, '404.html'));

// Jekyll 처리 비활성화 (_로 시작하는 에셋 파일이 무시되는 것을 방지)
await writeFile(resolve(distDir, '.nojekyll'), '');

console.log('[postbuild] dist/404.html, dist/.nojekyll 생성 완료');
