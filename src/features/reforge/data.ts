import { useQuery } from '@tanstack/react-query';

/**
 * 세공 도구 확률표. scripts/build-reforge.mjs 가 모아 둔 정적 파일이다.
 *
 * 도구, 아이템 타입, 종족마다 붙을 수 있는 옵션과 레벨 폭이 다르다. 같은 옵션 묶음이 여러 조합에
 * 되풀이되므로 묶음(pools)은 한 번만 적고, 조합(tables)은 묶음 번호만 가리킨다.
 */

export type ReforgeToolId = 'fine' | 'radiant' | 'brilliant';

export interface ReforgeTool {
  id: ReforgeToolId;
  /** 경매장에 오르는 이름 그대로다. 시세를 이 이름으로 묻는다. */
  name: string;
  /** 확률표가 적용되기 시작한 날(YYYYMMDD). */
  date: string;
  /** 한계 돌파가 되는 옵션이 뽑혔을 때 한계 돌파 구간에 들어갈 확률. 0.001 이 0.1% 다. */
  limitBreakRate: number;
}

export interface ReforgeItemType {
  id: number;
  name: string;
}

/** [옵션 번호, 최소, 최대] 또는 한계 돌파가 되면 [옵션 번호, 최소, 최대, 한계 돌파 최소, 최대]. */
export type PoolRow = [option: number, min: number, max: number, lbMin?: number, lbMax?: number];

export interface ReforgeData {
  tools: ReforgeTool[];
  /** 확률표의 종족 이름. 번호가 tables 키의 마지막 칸이다. */
  races: string[];
  types: ReforgeItemType[];
  /** 옵션 문장. "대미지밸런스(1레벨 당 1 % 증가)" */
  options: string[];
  pools: PoolRow[][];
  /** "도구|타입|종족" -> pools 번호 */
  tables: Record<string, number>;
}

export function useReforgeDataQuery() {
  return useQuery({
    queryKey: ['reforge', 'data'],
    queryFn: async ({ signal }): Promise<ReforgeData> => {
      const response = await fetch(`${import.meta.env.BASE_URL}data/reforge.json`, { signal });
      if (!response.ok) throw new Error(`세공 확률표를 받지 못했습니다. (HTTP ${response.status})`);
      return (await response.json()) as ReforgeData;
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export const tableKey = (tool: ReforgeToolId, type: number, race: number) =>
  `${tool}|${type}|${race}`;

/** 그 도구로 그 타입에 고를 수 있는 종족 번호. 확률표에 없는 조합은 뺀다. */
export function racesFor(data: ReforgeData, tool: ReforgeToolId, type: number): number[] {
  return data.races
    .map((_, race) => race)
    .filter((race) => tableKey(tool, type, race) in data.tables);
}

/** 그 도구로 세공할 수 있는 아이템 타입. */
export function typesFor(data: ReforgeData, tool: ReforgeToolId): ReforgeItemType[] {
  return data.types.filter((type) => racesFor(data, tool, type.id).length > 0);
}

/**
 * 아이템 타입을 큰 갈래로 묶는다. 확률표는 타입 70개 남짓을 한 줄로 늘어놓아 고르기 어렵다.
 * 무기가 아닌 것만 적어 두고 나머지는 무기로 친다. 게임에 새 타입이 생기면 여기에 더한다.
 */
export const TYPE_GROUPS = ['무기', '방어구', '액세서리', '기타'] as const;
export type TypeGroup = (typeof TYPE_GROUPS)[number];

const ARMOR = new Set([
  '중갑옷',
  '중갑 투구',
  '중갑 건틀렛',
  '중갑 신발',
  '방패',
  '경갑옷',
  '모자',
  '장갑',
  '신발',
  '천옷',
  '천옷(교역 강화 의상)',
]);

const ACCESSORY = new Set(['액세서리']);

/** 무기가 아닌 생활 도구와 특수 아이템. 좁은 화면에서 갈래 이름이 잘리지 않게 "기타" 로 부른다. */
const OTHER = new Set([
  '조련 지팡이',
  '채집 도구',
  '야금용 체',
  '실크방직 장갑',
  '대장장이 망치',
  '낚싯대',
  '요리 도구',
  '핸디크래프트 키트',
  '목공 도구',
  '장작용 도끼',
  '재봉 키트',
  '셰프의 거친 손길',
  'L로드',
  '썬로드 콜트',
  '핀 벨',
  '데모닉 나이트메어 드림캐쳐',
]);

export function groupOfType(name: string): TypeGroup {
  if (ARMOR.has(name)) return '방어구';
  if (ACCESSORY.has(name)) return '액세서리';
  if (OTHER.has(name) || name.includes('도구')) return '기타';
  return '무기';
}
