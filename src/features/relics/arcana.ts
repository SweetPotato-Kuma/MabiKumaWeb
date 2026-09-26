import { useQuery } from '@tanstack/react-query';
import { normalizeForSearch } from '@/features/auction/dictionary';
import type { MuriasRow } from './prices';

/**
 * 아르카나와 그 스킬. scripts/build-arcana.mjs 가 게임 데이터에서 뽑아 둔 정적 파일이다.
 *
 * 무리아스의 유물 옵션은 스킬 하나를 강화하므로, 옵션 이름 앞의 스킬로 아르카나를 찾아 묶는다.
 * 넥슨 오픈 API 에는 스킬과 아르카나의 짝이 없다.
 */
export interface ArcanaSkill {
  id: number;
  name: string;
}

export interface Arcana {
  id: number;
  name: string;
  /** 각성 스킬. 아르카나 자체의 그림이 게임 데이터에 없어 이 스킬 그림을 아르카나의 얼굴로 쓴다. */
  awakening: number;
  skills: ArcanaSkill[];
}

export interface ArcanaData {
  updated: string;
  arcanas: Arcana[];
}

export function useArcanaQuery() {
  return useQuery({
    queryKey: ['relics', 'arcana'],
    queryFn: async ({ signal }): Promise<ArcanaData | null> => {
      const response = await fetch(`${import.meta.env.BASE_URL}data/arcana.json`, { signal });
      // 파일이 없으면 아르카나로 묶지 않고 옵션을 한데 보여 준다.
      if (!response.ok) return null;
      return (await response.json()) as ArcanaData;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}

/**
 * 옵션 이름이 어느 스킬의 것인지. 옵션 이름은 스킬 이름으로 시작한다("오버 드라이브 폭발 공격
 * 대미지"). 띄어쓰기는 보지 않고, 여럿이 맞으면 가장 긴 이름을 고른다("익시드 : 포스 슬램" 이
 * 짧은 스킬 이름에 먼저 걸리지 않게).
 */
export function skillOfOption(
  optionName: string,
  arcanas: readonly Arcana[],
): { arcana: Arcana; skill: ArcanaSkill } | null {
  const option = normalizeForSearch(optionName);
  let best: { arcana: Arcana; skill: ArcanaSkill; length: number } | null = null;
  for (const arcana of arcanas) {
    for (const skill of arcana.skills) {
      const name = normalizeForSearch(skill.name);
      if (name && option.startsWith(name) && (!best || name.length > best.length))
        best = { arcana, skill, length: name.length };
    }
  }
  return best && { arcana: best.arcana, skill: best.skill };
}

export interface ArcanaOption {
  row: MuriasRow;
  /** 옵션이 강화하는 스킬. 찾지 못하면 null. */
  skill: ArcanaSkill | null;
}

export interface ArcanaGroup {
  /** 아르카나를 찾지 못한 옵션을 모은 묶음은 null. 맨 뒤에 온다. */
  arcana: Arcana | null;
  options: ArcanaOption[];
  /** 묶음 안 매물 수. */
  count: number;
}

/**
 * 옵션을 아르카나로 묶는다. 아르카나는 게임 데이터의 순서(번호)대로, 묶음 안의 옵션은 그
 * 아르카나의 스킬 순서대로 둔다. 매물이 없는 아르카나는 빼고, 아르카나를 찾지 못한 옵션은
 * 버리지 않고 맨 뒤 묶음에 모은다. 게임에 새 스킬이 생기면 데이터를 다시 뽑기 전까지 거기에 온다.
 */
export function groupByArcana(
  rows: readonly MuriasRow[],
  arcanas: readonly Arcana[],
): ArcanaGroup[] {
  const groups = new Map<number | null, ArcanaGroup>();
  for (const row of rows) {
    const found = skillOfOption(row.name, arcanas);
    const key = found?.arcana.id ?? null;
    let group = groups.get(key);
    if (!group) {
      group = { arcana: found?.arcana ?? null, options: [], count: 0 };
      groups.set(key, group);
    }
    group.options.push({ row, skill: found?.skill ?? null });
    group.count += row.count;
  }
  const skillOrder = (arcana: Arcana | null, skill: ArcanaSkill | null) =>
    arcana && skill ? arcana.skills.findIndex((each) => each.id === skill.id) : Infinity;
  for (const group of groups.values())
    group.options.sort(
      (a, b) =>
        skillOrder(group.arcana, a.skill) - skillOrder(group.arcana, b.skill) ||
        a.row.name.localeCompare(b.row.name, 'ko'),
    );
  return [...groups.values()].sort(
    (a, b) => (a.arcana?.id ?? Infinity) - (b.arcana?.id ?? Infinity),
  );
}
