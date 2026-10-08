#!/usr/bin/env node
/**
 * 게임 데이터 한 번에 갱신하기
 *
 * 게임 클라이언트에서 꺼낸 것으로 사이트의 게임 데이터를 모두 새로 만들고 올린다. 다른 사람의 서버는 쓰지
 * 않는다. 클라이언트에 없는 것만 넥슨 공식 홈페이지(장인 개조 확률, 세공 도구 확률표)와 넥슨 오픈 API(경매장
 * 사전, 따로 도는 harvest)에서 읽는다.
 *
 *   1. 클라이언트 내보내기       .cache/client-src/offline-audit/Run-ClientExport.ps1 (바뀐 패키지만 다시 푼다)
 *   2. 저장소 파일 만들기        제작법, 아르카나, 세트 효과, 인챈트 스크롤, 상세 검색 이름, 세공 도구 확률표
 *   3. 아이템 카드 올리기        제작법 재료 그림 -> 제작법 그림 이름 -> 키트 상자와 보상 그림 -> 경매장 사전의 카드
 *   4. 장비 정보 올리기
 *   5. 스킬, 오검 그림 올리기
 *
 * 올리는 단계는 지난번에 올린 것과 같은 칸, 같은 그림을 건너뛴다. 저장소 파일이 바뀌면 끝에 목록을 보여 준다.
 * 커밋과 푸시는 하지 않는다.
 *
 *   node scripts/game-data/sync-all.mjs
 *   node scripts/game-data/sync-all.mjs --skip-export   내보내기를 건너뛰고 마지막 내보내기를 쓴다
 *   node scripts/game-data/sync-all.mjs --no-upload     저장소 파일만 만든다
 *
 * 내보내기 스크립트가 다른 곳에 있으면 MABIKUMA_CLIENT_EXPORT 에 그 경로를 둔다.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = new Set(process.argv.slice(2));
const skipExport = args.has('--skip-export');
const upload = !args.has('--no-upload');

const EXPORT_SCRIPT = resolve(
  process.cwd(),
  process.env.MABIKUMA_CLIENT_EXPORT ?? '.cache/client-src/offline-audit/Run-ClientExport.ps1',
);
const NODE = process.execPath;

const log = (...parts) => console.log('[sync-all]', ...parts);

function run(label, command, commandArgs) {
  log(`${label}`);
  const started = Date.now();
  const result = spawnSync(command, commandArgs, { stdio: 'inherit' });
  if (result.status !== 0)
    throw new Error(`${label} 실패 (종료 코드 ${result.status ?? result.signal})`);
  log(`${label} 끝 (${Math.round((Date.now() - started) / 1000)}초)`);
}

const node = (label, script, scriptArgs = []) =>
  run(label, NODE, ['--max-old-space-size=4096', resolve(process.cwd(), script), ...scriptArgs]);

if (!skipExport) {
  if (!existsSync(EXPORT_SCRIPT))
    throw new Error(
      `${EXPORT_SCRIPT} 이 없습니다. MABIKUMA_CLIENT_EXPORT 에 내보내기 스크립트 경로를 두세요.`,
    );
  run('클라이언트 내보내기', 'powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    EXPORT_SCRIPT,
  ]);
}

node('제작법', 'scripts/build-recipes.mjs');
node('제작법에만 나오는 이름을 사전에', 'scripts/sync-recipe-names.mjs');
node('아르카나', 'scripts/build-arcana.mjs');
node('세트 효과', 'scripts/build-set-effects.mjs');
node('인챈트 스크롤', 'scripts/build-enchant-scrolls.mjs');
node('상세 검색 이름', 'scripts/build-option-names.mjs');
node('세공 도구 확률표', 'scripts/build-reforge.mjs');

if (upload) {
  node('제작법 재료 그림', 'scripts/game-data/collect-item-cards.mjs', ['--recipe-icons']);
  node('제작법 그림 이름', 'scripts/build-recipes.mjs', ['--icons-only']);
  node('키트 상자와 보상 그림', 'scripts/game-data/collect-item-cards.mjs', ['--kit-icons']);
  node('키트 그림 이름', 'scripts/build-kits.mjs', ['--icons-only']);
  node('아이템 카드', 'scripts/game-data/collect-item-cards.mjs');
  node('장비 정보', 'scripts/game-data/collect-equipment.mjs');
  node('스킬, 오검 그림', 'scripts/game-data/upload-game-images.mjs');
}

const changed = execFileSync(
  'git',
  ['status', '--porcelain', '--', 'public/data', 'src/features/itemcard/generated'],
  {
    encoding: 'utf8',
  },
).trim();
log('');
log(changed ? `바뀐 저장소 파일:\n${changed}` : '바뀐 저장소 파일이 없습니다.');
