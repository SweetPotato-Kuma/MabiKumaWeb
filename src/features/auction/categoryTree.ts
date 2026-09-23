import { AUCTION_ITEM_CATEGORIES } from './constants';

/**
 * 경매장 카테고리 묶음.
 *
 * 넥슨 API 는 auction_item_category 를 평면 목록으로만 준다. 82개를 한 줄로 늘어놓으면
 * 고를 수가 없어서 화면에서만 쓰는 상위 묶음을 여기서 정의한다. 요청에는 언제나
 * 잎(실제 카테고리 이름)만 실어 보낸다. 묶음 이름은 API 에 존재하지 않는다.
 *
 * 묶음과 순서는 사용자들이 이미 익숙한 경매장 도구의 트리를 그대로 따른다. 같은 자리에
 * 같은 이름이 있어야 헤매지 않는다. 잎이 빠지거나 겹치면
 * categoryTree.test.ts 가 잡는다.
 */
export interface CategoryGroup {
  name: string;
  categories: readonly string[];
}

export const CATEGORY_GROUPS: readonly CategoryGroup[] = [
  {
    name: '근거리 장비',
    categories: ['한손 장비', '양손 장비', '검', '도끼', '둔기', '랜스', '핸들', '너클', '체인 블레이드'],
  },
  {
    name: '원거리 장비',
    categories: ['활', '석궁', '듀얼건', '수리검', '아틀라틀', '원거리 소모품'],
  },
  {
    name: '마법 장비',
    categories: ['실린더', '스태프', '원드', '마도서', '힐링 원드'],
  },
  {
    name: '점성술 장비',
    categories: ['대형 낫', '오브'],
  },
  {
    name: '갑옷 장비',
    categories: ['중갑옷', '경갑옷', '천옷'],
  },
  {
    name: '방어 장비',
    categories: ['장갑', '신발', '모자/가발', '방패', '로브'],
  },
  {
    name: '액세서리',
    categories: ['얼굴 장식', '액세서리', '날개', '꼬리'],
  },
  {
    name: '특수 장비',
    categories: ['악기', '생활 도구', '마리오네트', '에코스톤', '에이도스', '유물', '기타 장비'],
  },
  {
    name: '설치물',
    categories: ['의자/사물', '낭만농장/달빛섬'],
  },
  {
    name: '인챈트 용품',
    categories: ['인챈트 스크롤', '마법가루'],
  },
  {
    name: '스크롤',
    categories: ['도면', '옷본', '마족 스크롤', '기타 스크롤'],
  },
  {
    name: '마기그래프 용품',
    categories: ['마기그래프', '마기그래프 도안', '기타 재료'],
  },
  {
    name: '서적',
    categories: ['책', '마비노벨', '페이지'],
  },
  {
    name: '소모품',
    categories: [
      '포션',
      '음식',
      '허브',
      '던전 통행증',
      '알반 훈련석',
      '개조석',
      '보석',
      '변신 메달',
      '염색 앰플',
      '스케치',
      '핀즈비즈',
      '기타 소모품',
    ],
  },
  {
    name: '토템',
    categories: ['애뮬릿', '토템'],
  },
  {
    name: '생활 재료',
    categories: ['주머니', '천옷/방직', '제련/블랙스미스', '힐웬 공학', '매직 크래프트'],
  },
  {
    name: '기타',
    categories: ['제스처', '말풍선 스티커', '피니 펫', '불타래', '퍼퓸', '분양 메달', '뷰티 쿠폰', '기타'],
  },
] as const;

/** 묶음에 들어 있는 모든 잎. 검증과 목록 렌더에 쓴다. */
export const GROUPED_CATEGORIES: readonly string[] = CATEGORY_GROUPS.flatMap((group) => group.categories);

/**
 * 트리 노드 키.
 *
 * '액세서리', '토템', '기타' 는 묶음 이름이면서 동시에 실제 카테고리 이름이다.
 * 키를 이름 그대로 쓰면 묶음을 펼치는 것과 잎을 고르는 것이 같은 키가 되어 엉킨다.
 * 그래서 묶음에만 접두사를 붙이고, 잎은 요청에 그대로 실어야 하므로 이름을 유지한다.
 */
const GROUP_KEY_PREFIX = 'group:';

export function groupKeyOf(groupName: string): string {
  return `${GROUP_KEY_PREFIX}${groupName}`;
}

export function isGroupKey(key: string): boolean {
  return key.startsWith(GROUP_KEY_PREFIX);
}

/** 트리에 등장하는 모든 키. 잎은 카테고리 이름 그대로, 묶음은 접두사가 붙는다. */
export function allTreeKeys(): string[] {
  return CATEGORY_GROUPS.flatMap((group) => [groupKeyOf(group.name), ...group.categories]);
}

/** 이 카테고리가 속한 묶음 이름. 트리를 펼친 채로 열어 둘 때 쓴다. */
export function findGroupOf(category: string): string | undefined {
  return CATEGORY_GROUPS.find((group) => group.categories.includes(category))?.name;
}

/**
 * 묶음에서 빠진 카테고리. API 스펙이 늘어나면 여기에 잡힌다.
 * 화면에서는 이 목록을 '기타' 묶음 뒤에 그대로 붙여 하나도 잃지 않는다.
 */
export function findUngroupedCategories(): string[] {
  const grouped = new Set(GROUPED_CATEGORIES);
  return AUCTION_ITEM_CATEGORIES.filter((category) => !grouped.has(category));
}
