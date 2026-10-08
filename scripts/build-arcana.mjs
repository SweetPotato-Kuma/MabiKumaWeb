/**
 * 아르카나와 그 스킬 모으기
 *
 * 무리아스의 유물 옵션은 스킬 하나를 강화한다("오버 드라이브 폭발 공격 대미지"). 유물 시세 화면은
 * 옵션을 그 스킬의 아르카나로 묶어 보여 주는데, 넥슨 오픈 API 에는 어느 스킬이 어느 아르카나인지가
 * 없다. 클라이언트 내보내기의 아르카나 목록(MultiClassCommon.xml, 스킬 번호가 딸려 있다)에서 그것을 뽑는다.
 *
 * 뽑는 것:
 * - 아르카나마다 번호, 이름, 각성 스킬 번호, 딸린 스킬(번호와 이름)
 * - 딸린 스킬과 각성 스킬의 그림(42px)은 그림 서버에 있다(scripts/game-data/upload-game-images.mjs). 제작 스킬 그림과
 *   같은 자리다. 게임 데이터에 아르카나 자체의 그림은 없어서, 화면은 각성 스킬 그림을 아르카나의
 *   얼굴로 쓴다(아르카나마다 하나뿐이고 서로 겹치지 않는다)
 *
 * 실행: node scripts/build-arcana.mjs
 * 산출: public/data/arcana.json
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { latestBundleRun } from './game-data/bundle-items.mjs';
import { loadSkills } from './game-data/client-recipes.mjs';
import { loadClientRecords } from './game-data/client-tables.mjs';

const OUT = resolve('public/data/arcana.json');

async function main() {
  const run = latestBundleRun();
  const { pick, updated, enabled } = loadClientRecords(run);
  const skills = loadSkills(run, enabled);
  const skillName = (id) => skills.get(Number(id))?.name ?? '';
  const arcana = (tag, key) => pick('arcana.jsonl.gz', (r) => r.tag === tag, key);
  const ultimate = new Map(
    [...arcana('ArcanaUltimateSkillListInfo', 'classId')].map(([id, { attributes: a }]) => [
      id,
      Number(a.UltimateSkill_Id),
    ]),
  );

  const arcanas = [...arcana('MultiClassInfo', 'classId')]
    .map(([id, record]) => ({
      id: Number(id),
      name: (record.localized?.localName ?? '').trim(),
      awakening: ultimate.get(id),
      skills: String(record.attributes.classSkillBinding ?? '')
        .split('|')
        .filter(Boolean)
        .map((skill) => ({ id: Number(skill), name: skillName(skill) }))
        .filter((skill) => skill.name),
    }))
    .filter((entry) => entry.name && entry.skills.length > 0)
    .sort((a, b) => a.id - b.id);

  // 아르카나 한 줄에 하나씩 적어 다음 수집 때 무엇이 바뀌었는지 diff 로 보이게 한다.
  const body = [
    '{',
    `"updated":${JSON.stringify(updated)},`,
    '"arcanas":[',
    arcanas.map((entry) => JSON.stringify(entry)).join(',\n'),
    ']}',
    '',
  ].join('\n');
  await writeFile(OUT, body);
  console.log(`아르카나 ${arcanas.length}개 -> ${OUT}`);
}

await main();
