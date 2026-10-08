/**
 * 키트(확률형 상품) 그림 이름 표
 *
 * 확률표는 워커가 공식 확률 정보 화면에서 한 시간마다 모아 D1 에 쌓는다(worker/kits.js). 이 스크립트는 거기에
 * 게임 클라이언트가 있어야만 만들 수 있는 것, 키트 이름과 보상 이름 -> 그림 파일 이름 표를 만들어 올린다.
 * 같은 보상이 여러 키트에 되풀이되므로 키트마다 적지 않고 이름으로 한 번만 둔다.
 *
 * 키트 이름과 보상 이름을 아이템 번호로 잇고(game-data/kit-names.mjs), 그 번호로 올린 그림
 * (.cache/item-cards/uploaded.json, collect-item-cards.mjs --kit-icons)을 찾는다. scripts/game-data/sync-all.mjs 가 부른다.
 *
 * 실행: node scripts/build-kits.mjs --icons-only        그림 이름 표를 다시 만들어 올린다
 *       node scripts/build-kits.mjs --import <파일>     예전에 모아 둔 기록 파일을 한 번 올린다(이미 있는 키트는 그대로)
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { latestBundleRun, loadBundleItems } from './game-data/bundle-items.mjs';
import { buildKitNameIndex, kitIconIds } from './game-data/kit-names.mjs';
import { importKitArchive, readKitArchive, uploadKitIcons } from './lib/kit-archive.mjs';

async function iconsOnly() {
  const archive = await readKitArchive();
  const uploaded = JSON.parse(await readFile(resolve('.cache/item-cards/uploaded.json'), 'utf8'));
  const run = latestBundleRun();
  const images = JSON.parse(await readFile(resolve(run, 'images/item-images.json'), 'utf8'));
  const index = buildKitNameIndex(loadBundleItems(run), (id) => Boolean(images[String(id)]));
  const { boxOf, itemOf } = kitIconIds(archive.kits, index);
  const icons = {};
  for (const [name, id] of [...boxOf, ...itemOf]) if (uploaded[id]) icons[name] = uploaded[id];
  const sorted = Object.fromEntries(
    Object.entries(icons).sort(([a], [b]) => a.localeCompare(b, 'ko')),
  );
  const boxes = archive.kits.filter((kit) => sorted[kit.name]).length;
  console.log(
    `그림을 붙인 키트 ${boxes}/${archive.kits.length}, 이름 ${Object.keys(sorted).length}개`,
  );
  const before = Object.fromEntries(
    Object.entries(archive.icons ?? {}).sort(([a], [b]) => a.localeCompare(b, 'ko')),
  );
  if (JSON.stringify(before) === JSON.stringify(sorted)) {
    console.log('바뀐 그림이 없습니다.');
    return;
  }
  const result = await uploadKitIcons(sorted);
  console.log(`그림 이름 표를 올렸습니다. ${result.icons}개`);
}

async function importFile(path) {
  const archive = JSON.parse(await readFile(resolve(path), 'utf8'));
  const result = await importKitArchive(archive);
  console.log(
    `키트 ${result.received}개를 보내 ${result.added}개를 더했습니다. 그림 이름 ${result.icons}개`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const at = process.argv.indexOf('--import');
  if (at >= 0) {
    if (!process.argv[at + 1]) throw new Error('--import 뒤에 올릴 기록 파일을 적어 주세요.');
    await importFile(process.argv[at + 1]);
  } else {
    await iconsOnly();
  }
}
