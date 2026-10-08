import { useQuery } from '@tanstack/react-query';
import { fetchGameData } from '@/lib/gameData';

/**
 * 장비 세트 효과. scripts/build-set-effects.mjs 가 게임 클라이언트 데이터에서 모아 둔 정적 파일이다.
 *
 * 세트 효과가 붙은 장비는 효과마다 수치를 준다. 함께 장착한 장비들의 수치 합이 효과의 발동 기준
 * (대부분 10) 이상이면 효과가 켜진다. 같은 세트의 부위들이 같은 효과를 나눠 갖는다.
 */

export interface SetEffectDef {
  name: string;
  /** 효과 설명. 줄은 \n 으로 나뉜다. 이름과 같으면 비어 있다. */
  desc: string;
  /** 발동 기준. 장착한 장비들의 수치 합이 이 값 이상이면 켜진다. */
  need: number;
}

/** [효과 키, 최소, 최대] 또는 품질 조건이 붙으면 [효과 키, 최소, 최대, 품질]. */
export type SetEffectLine = [key: string, min: number, max: number, quality?: number];

export interface SetEffectData {
  updated: string;
  effects: Record<string, SetEffectDef>;
  /** 아이템 이름 -> 그 아이템이 주는 세트 효과 수치 */
  items: Record<string, SetEffectLine[]>;
}

export function useSetEffectsQuery() {
  return useQuery({
    queryKey: ['equipment', 'setEffects'],
    queryFn: async ({ signal }): Promise<SetEffectData> => {
      const response = await fetchGameData('set-effects.json', { signal });
      if (!response.ok)
        throw new Error(`세트 효과 표를 받지 못했습니다. (HTTP ${response.status})`);
      return (await response.json()) as SetEffectData;
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** 효과 하나에 대해 한 장비가 주는 수치. 품질 조건이 붙은 줄은 bonus 에 따로 둔다. */
export interface SetContribution {
  min: number;
  max: number;
  bonus: { quality: number; min: number; max: number }[];
}

export interface ItemSetEffect {
  key: string;
  def: SetEffectDef;
  own: SetContribution;
  /** 같은 효과를 주는 다른 장비. 최대 수치가 큰 것부터. */
  others: { name: string; contribution: SetContribution }[];
}

function contributionsOf(lines: readonly SetEffectLine[]): Map<string, SetContribution> {
  const byKey = new Map<string, SetContribution>();
  for (const [key, min, max, quality] of lines) {
    let entry = byKey.get(key);
    if (!entry) {
      entry = { min: 0, max: 0, bonus: [] };
      byKey.set(key, entry);
    }
    if (quality === undefined) {
      entry.min += min;
      entry.max += max;
    } else {
      entry.bonus.push({ quality, min, max });
    }
  }
  return byKey;
}

/** 띄어쓰기만 다른 이름도 같은 아이템으로 본다. 경매장과 게임 데이터의 띄어쓰기가 가끔 다르다. */
const compact = (name: string) => name.replace(/\s+/g, '');

/** 이 이름의 장비가 주는 세트 효과. 게임 데이터의 효과 순서를 지킨다. 세트 효과가 없으면 빈 배열. */
export function itemSetEffects(data: SetEffectData, name: string): ItemSetEffect[] {
  let lines = data.items[name];
  if (!lines) {
    const target = compact(name);
    const match = Object.keys(data.items).find((other) => compact(other) === target);
    lines = match ? data.items[match] : [];
  }
  const own = contributionsOf(lines);

  const result: ItemSetEffect[] = [];
  for (const [key, contribution] of own) {
    const def = data.effects[key];
    if (!def) continue;
    const others: ItemSetEffect['others'] = [];
    for (const [otherName, otherLines] of Object.entries(data.items)) {
      if (otherLines === lines) continue;
      const other = contributionsOf(otherLines).get(key);
      if (other) others.push({ name: otherName, contribution: other });
    }
    others.sort(
      (a, b) => b.contribution.max - a.contribution.max || a.name.localeCompare(b.name, 'ko'),
    );
    result.push({ key, def, own: contribution, others });
  }
  return result;
}

/** "+3" 또는 "+3~5". */
export function formatSetRange(min: number, max: number): string {
  return min === max ? `+${max}` : `+${min}~${max}`;
}

/** "+3~5" 뒤에 품질 조건 수치를 붙인다. "+2 (품질 90 이상 +1)" */
export function describeContribution({ min, max, bonus }: SetContribution): string {
  const extra = bonus.map(
    (line) => `품질 ${line.quality} 이상 ${formatSetRange(line.min, line.max)}`,
  );
  const base = min || max ? formatSetRange(min, max) : '';
  if (!extra.length) return base;
  return base ? `${base} (${extra.join(', ')})` : extra.join(', ');
}
