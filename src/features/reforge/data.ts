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

/** 옵션 하나의 레벨 상한. max 는 일반 구간의 끝 레벨, lbMax 는 한계 돌파 구간의 끝 레벨(없으면 0). */
export interface LevelCap {
  max: number;
  lbMax: number;
}

const capsCache = new WeakMap<ReforgeData, Map<string, Map<number, LevelCap>>>();

/**
 * 그 장비(타입, 종족)에 붙는 옵션마다의 레벨 상한. 상한은 도구와 관계없이 같다(data.test.ts 가 지킨다).
 * 도구마다 확률표에 오르는 옵션은 달라서(영롱한과 찬란한 표에는 변신 옵션이 없다) 모든 도구의 표를
 * 합쳐 찾는다. 지금 고른 도구의 표만 보면, 다른 도구로 붙인 옵션의 상한을 몰라 잘못 강조했다.
 */
export function levelCaps(data: ReforgeData, type: number, race: number): Map<number, LevelCap> {
  let byItem = capsCache.get(data);
  if (!byItem) {
    byItem = new Map();
    capsCache.set(data, byItem);
  }
  const key = `${type}|${race}`;
  const cached = byItem.get(key);
  if (cached) return cached;
  const caps = new Map<number, LevelCap>();
  for (const tool of data.tools) {
    const index = data.tables[tableKey(tool.id, type, race)];
    if (index === undefined) continue;
    for (const [option, , max, , lbMax = 0] of data.pools[index]) {
      if (!caps.has(option)) caps.set(option, { max, lbMax });
    }
  }
  byItem.set(key, caps);
  return caps;
}

/**
 * 아이템 타입 트리. 확률표는 타입 60개 남짓을 한 줄로 늘어놓아 고르기 어렵다. 묶음 이름과 순서는
 * 경매장 카테고리 트리(features/auction/categoryTree.ts)를 따른다. 같은 자리에 같은 이름이 있어야
 * 헤매지 않는다. 게임에 새 타입이 생기면 여기에 더한다. 빠진 타입은 트리 끝의 "분류되지 않음" 에 붙고,
 * data.test.ts 가 잡는다.
 */
export const TYPE_TREE: readonly { name: string; types: readonly string[] }[] = [
  {
    name: '근거리 장비',
    types: [
      '한손 검',
      '양손 검',
      '레이피어',
      '한손 도끼',
      '양손 도끼',
      '한손 둔기',
      '양손 둔기',
      '랜스',
      '너클',
      '마력 너클',
      '핸들',
      '체인 블레이드',
    ],
  },
  { name: '원거리 장비', types: ['활', '석궁', '듀얼건', '썬로드 콜트', '수리검', '아틀라틀'] },
  {
    name: '마법 장비',
    types: [
      '라이트닝 원드',
      '아이스 원드',
      '파이어 원드',
      '트라이볼트 원드',
      '타격용 원드',
      '힐링 원드',
      '스태프',
      '실린더',
      '타워 실린더',
      '마도서',
    ],
  },
  { name: '점성술 장비', types: ['대형 낫', '오브'] },
  { name: '갑옷 장비', types: ['중갑옷', '경갑옷', '천옷', '천옷(교역 강화 의상)'] },
  {
    name: '방어 장비',
    types: ['중갑 투구', '중갑 건틀렛', '중갑 신발', '모자', '장갑', '신발', '방패'],
  },
  { name: '액세서리', types: ['액세서리'] },
  {
    name: '특수 장비',
    types: [
      '악기(현혹의 연주 가능)',
      '악기(현혹의 연주 불가)',
      '퍼핏 인형',
      '조련 지팡이',
      '핀 벨',
      '데모닉 나이트메어 드림캐쳐',
      '셰프의 거친 손길',
    ],
  },
  {
    name: '생활 도구',
    types: [
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
      'L로드',
    ],
  },
];

/** 트리 끝에 붙는 묶음. TYPE_TREE 에 없는 타입이 여기로 간다. */
export const UNGROUPED = '분류되지 않음';

export interface TypeTreeGroup {
  name: string;
  types: ReforgeItemType[];
}

/** 고를 수 있는 타입을 트리로 묶는다. 빈 묶음은 뺀다. */
export function typeTree(types: readonly ReforgeItemType[]): TypeTreeGroup[] {
  const byName = new Map(types.map((type) => [type.name, type]));
  const grouped = new Set(TYPE_TREE.flatMap((group) => group.types));
  const groups = TYPE_TREE.map((group) => ({
    name: group.name,
    types: group.types.flatMap((name) => byName.get(name) ?? []),
  }));
  groups.push({ name: UNGROUPED, types: types.filter((type) => !grouped.has(type.name)) });
  return groups.filter((group) => group.types.length > 0);
}

/** [경매장 카테고리, 아이템 이름, 그림 파일]. 그림 파일이 있으면 목록을 거치지 않고 그것을 쓴다. */
export type TypeIconSource = readonly [category: string, item: string, file?: string];

/**
 * 타입마다 그림으로 쓸 대표 아이템: [경매장 카테고리, 아이템 이름]. 그 아이템의 게임 그림을
 * 카테고리별 그림 목록에서 찾는다. 여기 없는 타입은 그림 없이 이름만 나온다.
 *
 * 경매장에 오른 적 없는 장비는 카테고리별 그림 목록에 없어서 그림 파일 이름을 직접 적는다.
 * 파일 이름은 제작법 데이터(public/data/recipes.json)가 아이템 번호로 적어 둔 것과 같다.
 *
 * 대표는 그 타입의 최상위 장비로 맞춘다. 기본 장비와 최상위 장비가 섞이면 그림의 결이 들쭉날쭉하다.
 * 무기는 소울 리버레이트, 방어구는 더스크바운드 비고러스가 최상위다. 비고러스가 없는 방어구 부위는
 * 같은 탈라 가흐 장비인 더스크바운드 이지스(중갑)와 에테리얼(천옷)을 쓴다. 무기에 소울 리버레이트가
 * 없는 타입은 나이트브링어, 페러시우스 순으로, 그것도 없으면 기본 능력치가 가장 높은 장비를 쓰되 장난감 같은
 * 외형 아이템은 뺐다.
 */
export const TYPE_ICONS: Readonly<Record<string, TypeIconSource>> = {
  '한손 검': ['검', '소울 리버레이트 소드'],
  '양손 검': ['검', '소울 리버레이트 블레이드'],
  레이피어: ['양손 장비', '로미오의 레이피어'],
  '한손 도끼': ['도끼', '소울 리버레이트 액스'],
  '양손 도끼': ['도끼', '페러시우스 클리브 워리어 액스'],
  '한손 둔기': ['둔기', '소울 리버레이트 해머'],
  '양손 둔기': ['둔기', '매시브 디스페어 해머'],
  랜스: ['랜스', '소울 리버레이트 랜스'],
  너클: ['너클', '소울 리버레이트 너클'],
  '마력 너클': ['너클', '실리엔 마력 너클'],
  핸들: ['핸들', '소울 리버레이트 핸들'],
  '체인 블레이드': ['체인 블레이드', '페러시우스 렌딩 체인 블레이드'],
  활: ['활', '소울 리버레이트 보우'],
  석궁: ['석궁', '소울 리버레이트 크로스보우'],
  듀얼건: ['듀얼건', '소울 리버레이트 듀얼건'],
  '썬로드 콜트': ['듀얼건', '오라클 썬로드 콜트'],
  수리검: ['수리검', '나이트브링어 인필트레이터'],
  아틀라틀: ['아틀라틀', '페더 아틀라틀'],
  '라이트닝 원드': ['원드', '크리스탈 라이트닝 원드'],
  '아이스 원드': ['원드', '마족표 크라운 아이스 원드'],
  '파이어 원드': ['원드', '마족표 파이어 원드'],
  '트라이볼트 원드': ['원드', '소울 리버레이트 원드'],
  '타격용 원드': ['원드', '타격용 원드'],
  '힐링 원드': ['힐링 원드', '소울 리버레이트 힐링 원드'],
  스태프: ['스태프', '소울 리버레이트 스태프'],
  실린더: ['실린더', '소울 리버레이트 실린더'],
  '타워 실린더': ['실린더', '타워 실린더'],
  마도서: ['마도서', '소울 리버레이트 마도서'],
  '대형 낫': ['대형 낫', '소울 리버레이트 사이드'],
  오브: ['오브', '소울 리버레이트 오브'],
  중갑옷: ['중갑옷', '더스크바운드 이지스 가드(남성용)', 'fec8a7fc631ef0cb.webp'],
  경갑옷: ['경갑옷', '더스크바운드 비고러스 아머(남성용)', '6324c60bfbd2da8e.webp'],
  천옷: ['천옷', '더스크바운드 에테리얼 수트(남성용)', '0d866811682ca2c3.webp'],
  '천옷(교역 강화 의상)': ['천옷', '브리엘의 의상'],
  '중갑 투구': ['모자/가발', '더스크바운드 비고러스 레더 헬멧', '6bc5787cf3898462.webp'],
  '중갑 건틀렛': ['장갑', '더스크바운드 이지스 건틀렛', '750de617a66fbaa6.webp'],
  '중갑 신발': ['신발', '더스크바운드 이지스 그리브', '44593f86f33fef12.webp'],
  모자: ['모자/가발', '더스크바운드 에테리얼 튜더 베레모', '8f6676c918319ad8.webp'],
  장갑: ['장갑', '더스크바운드 비고러스 글러브', '13a99d2b90f56bd5.webp'],
  신발: ['신발', '더스크바운드 비고러스 부츠', '5ac8fa67062ad9e2.webp'],
  방패: ['방패', '소울 리버레이트 실드'],
  액세서리: ['액세서리', '불완전한 공상의 왕관 헤일로'],
  '악기(현혹의 연주 가능)': ['악기', '소울 리버레이트 리라'],
  '악기(현혹의 연주 불가)': ['악기', '밀키웨이 큰 북'],
  '퍼핏 인형': ['한손 장비', '로나 퍼핏 인형'],
  '조련 지팡이': ['생활 도구', '고대의 조련 지팡이'],
  '핀 벨': ['생활 도구', '플러피 핀 벨'],
  '데모닉 나이트메어 드림캐쳐': ['생활 도구', '데모닉 나이트메어 드림캐쳐'],
  '셰프의 거친 손길': ['기타 장비', '셰프의 거친 손길'],
  '채집 도구': ['생활 도구', '튼튼한 곡괭이'],
  '야금용 체': ['생활 도구', '야금용 체'],
  '실크방직 장갑': ['장갑', '전문가용 실크방직 장갑'],
  '대장장이 망치': ['생활 도구', '튼튼한 대장장이 망치'],
  낚싯대: ['생활 도구', '튼튼한 낚싯대'],
  '요리 도구': ['생활 도구', '튼튼한 반죽용 밀대'],
  '핸디크래프트 키트': ['생활 도구', '핸디크래프트 키트'],
  '목공 도구': ['생활 도구', '목공용 대패'],
  '장작용 도끼': ['생활 도구', '장작용 도끼'],
  '재봉 키트': ['생활 도구', '재봉 키트'],
  L로드: ['생활 도구', '모험가의 L 로드'],
};
