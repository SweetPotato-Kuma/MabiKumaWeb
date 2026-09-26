/**
 * 아르카나와 그 스킬 모으기
 *
 * 무리아스의 유물 옵션은 스킬 하나를 강화한다("오버 드라이브 폭발 공격 대미지"). 유물 시세 화면은
 * 옵션을 그 스킬의 아르카나로 묶어 보여 주는데, 넥슨 오픈 API 에는 어느 스킬이 어느 아르카나인지가
 * 없다. 게임 클라이언트 데이터의 아르카나 목록(스킬 번호가 딸려 있다)에서 그것을 뽑는다.
 *
 * 뽑는 것:
 * - 아르카나마다 번호, 이름, 각성 스킬 번호, 딸린 스킬(번호와 이름)
 * - 딸린 스킬과 각성 스킬의 그림(42px)을 public/data/skills/<번호>.png 로 둔다. 제작 스킬 그림과
 *   같은 자리다. 게임 데이터에 아르카나 자체의 그림은 없어서, 화면은 각성 스킬 그림을 아르카나의
 *   얼굴로 쓴다(아르카나마다 하나뿐이고 서로 겹치지 않는다)
 *
 * 실행: node scripts/build-arcana.mjs
 * 산출: public/data/arcana.json, public/data/skills/*.png
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadResourceData, RESOURCE_ORIGIN, stringLookup } from './lib/resource-data.mjs';

const REGION = 'kr';
const OUT = resolve('public/data/arcana.json');
const SKILL_ICON_DIR = resolve('public/data/skills');

async function main() {
  const { data, updated } = await loadResourceData(REGION);
  const text = stringLookup(data);
  const skillById = new Map(data.SkillList.map((skill) => [skill.Id, skill]));
  const skillName = (id) => text(skillById.get(id)?.Name).trim();

  const arcanas = data.MultiClassList.map((entry) => ({
    id: entry.Id,
    name: text(entry.Name).trim(),
    awakening: entry.AwakeningSkillId,
    skills: (entry.SkillBindingIds ?? [])
      .map((id) => ({ id, name: skillName(id) }))
      .filter((skill) => skill.name),
  }))
    .filter((arcana) => arcana.name && arcana.skills.length > 0)
    .sort((a, b) => a.id - b.id);

  await mkdir(SKILL_ICON_DIR, { recursive: true });
  const iconIds = [...new Set(arcanas.flatMap((arcana) => [arcana.awakening, ...arcana.skills.map((skill) => skill.id)]))];
  const missing = [];
  for (const id of iconIds) {
    const response = await fetch(`${RESOURCE_ORIGIN}skillimage/${REGION}/${id}/${id}.png`);
    if (!response.ok) {
      missing.push(id);
      continue;
    }
    await writeFile(resolve(SKILL_ICON_DIR, `${id}.png`), Buffer.from(await response.arrayBuffer()));
  }
  if (missing.length) console.warn(`그림을 받지 못한 스킬: ${missing.join(', ')}`);

  // 아르카나 한 줄에 하나씩 적어 다음 수집 때 무엇이 바뀌었는지 diff 로 보이게 한다.
  const body = [
    '{',
    `"updated":${JSON.stringify(updated)},`,
    '"arcanas":[',
    arcanas.map((arcana) => JSON.stringify(arcana)).join(',\n'),
    ']}',
    '',
  ].join('\n');
  await writeFile(OUT, body);
  console.log(
    `아르카나 ${arcanas.length}개, 스킬 그림 ${iconIds.length - missing.length}/${iconIds.length}장 -> ${OUT}`,
  );
}

await main();
