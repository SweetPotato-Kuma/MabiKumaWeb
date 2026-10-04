/**
 * 탈틴 농장 게임 데이터. 생활 협회 주문(필요 물품), 마법의 솥 가공법, NPC 두카트 환전가다.
 *
 * 아이템 이름은 경매장에 오른 이름과 같다(시세도 이 이름으로 묻는다). 주문의 납품 보상은 받을 때마다 달라서
 * 데이터에 두지 않고 방문자가 고른다.
 */

/** [아이템 이름, 개수] */
export type Material = readonly [name: string, qty: number];

export interface FarmOrder {
  name: string;
  materials: readonly Material[];
}

export interface FarmRecipe {
  /** 가공품 이름. */
  name: string;
  materials: readonly Material[];
}

export type DucatGroup = 'crafted' | 'normal' | 'fine' | 'finest';

export interface DucatItem {
  name: string;
  /** 1개를 NPC 에 넘기면 받는 두카트. */
  ducats: number;
  group: DucatGroup;
}

export interface RewardItem {
  key: string;
  label: string;
  /** 기본 가치(골드). 경매장에 오르지 않는 보상이라 방문자가 고칠 수 있다. */
  value: number;
}

const P = '탈틴 농장 ';

/** 목록 안에서는 모든 이름 앞에 붙는 "탈틴 농장" 을 뗀다. */
export const shortName = (name: string) => (name.startsWith(P) ? name.slice(P.length) : name);

export const FARM_ORDERS: readonly FarmOrder[] = [
  { name: '던바튼 학교 선생님의 주문', materials: [[`${P}일반 블랙베리`, 7], [`${P}일반 재스민`, 5]] },
  { name: '드래곤 유적 고고학자의 주문', materials: [[`${P}일반 오크라`, 4], [`${P}일반 마법 거미줄`, 2]] },
  { name: '반호르 대장장이의 주문', materials: [[`${P}일반 붉은 배`, 2], [`${P}일반 석영`, 2]] },
  { name: '티르 코네일 주민의 주문', materials: [[`${P}일반 고무`, 3], [`${P}일반 블랙베리`, 6]] },
  { name: '탈틴 화가의 주문', materials: [[`${P}블랙베리 주스`, 2], [`${P}레드문 귀걸이`, 2]] },
  { name: '코리브 계곡 여행 가이드의 주문', materials: [[`${P}자색 원단`, 2], [`${P}강력 접착제`, 2]] },
  { name: '블랙베리 집중 주문', materials: [[`${P}일반 블랙베리`, 18]] },
  { name: '오크라 집중 주문', materials: [[`${P}일반 오크라`, 12]] },
  { name: '재스민 집중 주문', materials: [[`${P}일반 재스민`, 9]] },
  { name: '붉은 배 집중 주문', materials: [[`${P}일반 붉은 배`, 6]] },
  { name: '고무 집중 주문', materials: [[`${P}일반 고무`, 6]] },
  { name: '마법 거미줄 집중 주문', materials: [[`${P}일반 마법 거미줄`, 3]] },
  { name: '석영 집중 주문', materials: [[`${P}일반 석영`, 3]] },
  {
    name: '두갈드 아일 목수의 주문',
    materials: [[`${P}일반 블랙베리`, 1], [`${P}자색 원단`, 2], [`${P}붉은 배 잼`, 2]],
  },
  {
    name: '슬리아브 퀼린 광부의 주문',
    materials: [[`${P}일반 오크라`, 1], [`${P}강력 접착제`, 1], [`${P}방수 원단`, 2]],
  },
  {
    name: '레자르 양조장 관리인의 주문',
    materials: [[`${P}일반 재스민`, 2], [`${P}레드문 귀걸이`, 2], [`${P}달콤 케이크`, 1]],
  },
  {
    name: '탈틴 괴짜 연금술사의 주문',
    materials: [[`${P}일반 붉은 배`, 1], [`${P}블랙베리 주스`, 1], [`${P}석영 파우더`, 2]],
  },
  {
    name: '케안 항구 선원의 주문',
    materials: [[`${P}일반 고무`, 2], [`${P}천연 고무`, 1], [`${P}별무늬 샐러드`, 1]],
  },
  {
    name: '센 마이 상점가 점원의 주문',
    materials: [[`${P}일반 마법 거미줄`, 2], [`${P}꽃무늬 원피스`, 1], [`${P}누름꽃 공예 함`, 1]],
  },
  {
    name: '반호르 시계 장인의 주문',
    materials: [[`${P}일반 석영`, 1], [`${P}퓨어 블러썸 머리핀`, 1], [`${P}강화 섬유`, 1]],
  },
  {
    name: '이멘 마하 인테리어 전문가의 주문',
    materials: [[`${P}자색 원단`, 1], [`${P}미드나잇 펄 페인트`, 2], [`${P}방수 원단`, 1]],
  },
  {
    name: '음유시인 캠프 방랑자의 주문',
    materials: [[`${P}퓨어 블러썸 머리핀`, 2], [`${P}황혼의 류트`, 1], [`${P}석영 파우더`, 1]],
  },
  {
    name: '던바튼 주민의 주문',
    materials: [[`${P}레드문 귀걸이`, 1], [`${P}새벽의 활`, 1], [`${P}누름꽃 공예 함`, 1]],
  },
  {
    name: '오스나 사일 산지기의 주문',
    materials: [[`${P}달콤 케이크`, 1], [`${P}이브닝 드레스`, 2], [`${P}붉은 배 잼`, 2]],
  },
  {
    name: '티르 코네일 보부상의 주문',
    materials: [[`${P}강력 접착제`, 2], [`${P}장식용 크리스탈 검`, 1], [`${P}천연 고무`, 2]],
  },
  {
    name: '카브 항구 의상 디자이너의 주문',
    materials: [[`${P}블랙베리 주스`, 2], [`${P}재스민 향수`, 1], [`${P}꽃무늬 원피스`, 1]],
  },
  {
    name: '케안 항구 무역 사무원의 주문',
    materials: [[`${P}별무늬 샐러드`, 2], [`${P}새벽의 활`, 2], [`${P}이브닝 드레스`, 2]],
  },
  {
    name: '아브 네아 상점가 점원의 주문',
    materials: [[`${P}강화 섬유`, 2], [`${P}장식용 크리스탈 검`, 2], [`${P}황혼의 류트`, 2]],
  },
  {
    name: '타라 큰손의 주문',
    materials: [[`${P}이브닝 드레스`, 2], [`${P}미드나잇 펄 페인트`, 2], [`${P}재스민 향수`, 2]],
  },
  {
    name: '라흐 왕성 시종의 주문',
    materials: [[`${P}재스민 향수`, 2], [`${P}장식용 크리스탈 검`, 2], [`${P}새벽의 활`, 2]],
  },
  { name: '꽃양배추 집중 주문', materials: [[`${P}일반 꽃양배추`, 6]] },
  { name: '황금 호박 집중 주문', materials: [[`${P}일반 황금 호박`, 6]] },
];

export const REWARD_ITEMS: readonly RewardItem[] = [
  { key: 'key', label: '생활 협회 열쇠', value: 25_000 },
  { key: 'brick', label: '저장고 업그레이드용 벽돌', value: 10_000 },
  { key: 'plate', label: '저장고 업그레이드용 철판', value: 20_000 },
  { key: 'paint', label: '저장고 업그레이드용 도료', value: 30_000 },
  { key: 'glass', label: '저장고 업그레이드용 유리', value: 40_000 },
];

/** 한 주문에서 받는 보상 칸 수의 상한. */
export const MAX_REWARD_SLOTS = 2;

/** 보상 한 칸에 받는 개수의 상한. */
export const MAX_REWARD_QTY = 4;

export const FARM_RECIPES: readonly FarmRecipe[] = [
  { name: `${P}블랙베리 주스`, materials: [[`${P}일반 재스민`, 1], [`${P}일반 블랙베리`, 1]] },
  { name: `${P}자색 원단`, materials: [[`${P}일반 마법 거미줄`, 1], [`${P}일반 블랙베리`, 1]] },
  { name: `${P}레드문 귀걸이`, materials: [[`${P}일반 석영`, 1], [`${P}일반 붉은 배`, 1]] },
  { name: `${P}강력 접착제`, materials: [[`${P}일반 고무`, 1], [`${P}일반 마법 거미줄`, 1]] },
  { name: `${P}달콤 케이크`, materials: [[`${P}일반 블랙베리`, 1], [`${P}일반 붉은 배`, 1]] },
  { name: `${P}꽃무늬 원피스`, materials: [[`${P}일반 재스민`, 1], [`${P}일반 마법 거미줄`, 1]] },
  { name: `${P}퓨어 블러썸 머리핀`, materials: [[`${P}일반 석영`, 1], [`${P}일반 재스민`, 1]] },
  { name: `${P}천연 고무`, materials: [[`${P}일반 오크라`, 1], [`${P}일반 고무`, 1]] },
  { name: `${P}붉은 배 잼`, materials: [[`${P}일반 오크라`, 1], [`${P}일반 붉은 배`, 1]] },
  { name: `${P}방수 원단`, materials: [[`${P}일반 마법 거미줄`, 1], [`${P}일반 고무`, 1]] },
  { name: `${P}석영 파우더`, materials: [[`${P}일반 마법 거미줄`, 1], [`${P}일반 석영`, 1]] },
  { name: `${P}누름꽃 공예 함`, materials: [[`${P}일반 재스민`, 1], [`${P}일반 고무`, 1]] },
  {
    name: `${P}별무늬 샐러드`,
    materials: [[`${P}일반 붉은 배`, 1], [`${P}일반 블랙베리`, 1], [`${P}일반 오크라`, 2]],
  },
  {
    name: `${P}강화 섬유`,
    materials: [[`${P}일반 오크라`, 1], [`${P}일반 고무`, 1], [`${P}일반 마법 거미줄`, 2]],
  },
  {
    name: `${P}미드나잇 펄 페인트`,
    materials: [[`${P}일반 블랙베리`, 1], [`${P}일반 고무`, 1], [`${P}일반 석영`, 2]],
  },
  {
    name: `${P}황혼의 류트`,
    materials: [[`${P}일반 블랙베리`, 1], [`${P}일반 재스민`, 1], [`${P}일반 붉은 배`, 2]],
  },
  {
    name: `${P}재스민 향수`,
    materials: [[`${P}일반 오크라`, 1], [`${P}일반 블랙베리`, 1], [`${P}일반 재스민`, 2]],
  },
  {
    name: `${P}이브닝 드레스`,
    materials: [[`${P}일반 재스민`, 1], [`${P}일반 석영`, 1], [`${P}일반 마법 거미줄`, 2]],
  },
  {
    name: `${P}장식용 크리스탈 검`,
    materials: [[`${P}일반 고무`, 1], [`${P}일반 오크라`, 1], [`${P}일반 석영`, 2]],
  },
  {
    name: `${P}새벽의 활`,
    materials: [[`${P}일반 석영`, 1], [`${P}일반 오크라`, 1], [`${P}일반 붉은 배`, 2]],
  },
];

/** 두카트를 골드로 바꾸는 기준. 두카트로 이것을 사서 경매장에 판다. */
export const DUCAT_GEM = { name: '티어드롭 젬스톤', ducats: 35_000 } as const;

const crafted = (name: string, ducats: number): DucatItem => ({ name: `${P}${name}`, ducats, group: 'crafted' });

/** 농작물 등급별 두카트. 순서는 블랙베리, 오크라, 재스민, 붉은 배, 고무, 마법 거미줄, 석영, 꽃양배추, 황금 호박. */
const CROPS = ['블랙베리', '오크라', '재스민', '붉은 배', '고무', '마법 거미줄', '석영', '꽃양배추', '황금 호박'] as const;
const CROP_DUCATS: Record<Exclude<DucatGroup, 'crafted'>, readonly number[]> = {
  normal: [600, 800, 1_500, 3_000, 3_200, 4_500, 4_900, 10_000, 13_000],
  fine: [700, 1_000, 1_800, 3_500, 4_000, 5_500, 6_000, 12_000, 18_000],
  finest: [900, 1_200, 2_200, 4_500, 5_000, 6_800, 7_500, 15_000, 20_000],
};
const GRADE_LABEL: Record<Exclude<DucatGroup, 'crafted'>, string> = { normal: '일반', fine: '고급', finest: '최고급' };

export const DUCAT_ITEMS: readonly DucatItem[] = [
  crafted('블랙베리 주스', 3_500),
  crafted('달콤 케이크', 6_000),
  crafted('붉은 배 잼', 7_000),
  crafted('별무늬 샐러드', 9_500),
  crafted('재스민 향수', 8_500),
  crafted('자색 원단', 8_000),
  crafted('꽃무늬 원피스', 10_000),
  crafted('방수 원단', 13_000),
  crafted('강화 섬유', 21_000),
  crafted('이브닝 드레스', 25_000),
  crafted('레드문 귀걸이', 12_000),
  crafted('퓨어 블러썸 머리핀', 10_500),
  crafted('석영 파우더', 15_000),
  crafted('미드나잇 펄 페인트', 22_000),
  crafted('장식용 크리스탈 검', 23_000),
  crafted('강력 접착제', 12_000),
  crafted('천연 고무', 7_000),
  crafted('누름꽃 공예 함', 8_500),
  crafted('황혼의 류트', 13_500),
  crafted('새벽의 활', 19_500),
  ...(['normal', 'fine', 'finest'] as const).flatMap((group) =>
    CROPS.map(
      (crop, index): DucatItem => ({
        name: `${P}${GRADE_LABEL[group]} ${crop}`,
        ducats: CROP_DUCATS[group][index],
        group,
      }),
    ),
  ),
];

/** 이 계산기가 시세를 묻는 이름 전부. 워커가 10분마다 모으는 시세 파일에도 이 이름들이 들어간다. */
export const FARM_PRICE_NAMES: readonly string[] = [
  ...new Set([
    ...FARM_ORDERS.flatMap((order) => order.materials.map(([name]) => name)),
    ...FARM_RECIPES.flatMap((recipe) => [recipe.name, ...recipe.materials.map(([name]) => name)]),
    ...DUCAT_ITEMS.map((item) => item.name),
    DUCAT_GEM.name,
  ]),
];
