/**
 * 장비 정보. 워커의 `GET /item-equip` 이 돌려주는 모양 그대로다.
 *
 * 운영자가 게임 클라이언트 데이터에서 뽑아 워커에 올려 둔 것이며, 경매장 API 가 주는 값이
 * 아니다. 이름을 짧게 둔 칸이 있는 것은 카테고리 한 칸(천옷은 2천 개 가까이)이 KV 한 값에
 * 들어가야 하기 때문이다.
 */

/** [능력치 이름, 최소, 최대]. 유동 능력치는 기본값에 더하는 폭이다. */
export type StatRange = [stat: string, min: number, max: number];

export interface EquipmentRecord {
  id: number;
  name: string;
  category: string;
  /** 기본 능력치. 값이 0 인 칸은 빠져 있다. */
  base?: Record<string, number>;
  /** 유동 능력치. 제작하거나 얻을 때 이 폭 안에서 정해져 기본값에 더해진다. */
  random?: StatRange[];
  upgrade?: {
    /** 일반 개조 횟수 */
    max: number;
    /** 보석 개조 횟수 */
    gemMax: number;
    ids: number[];
  };
  /** 세공. type 은 세공 옵션을 가르는 장비 종류(OHSword 등), races 는 h/e/g 조합. */
  reforge?: { type: string; races: string };
  /** 특별 개조 종류 번호(S, R)와 단계 상한 */
  special?: { s: number; r: number; max: number };
  /** 붙일 수 있는 인챈트 묶음 번호. 워커가 풀어 `EquipmentLookup.enchants` 로 싣는다. */
  enchants?: number;
}

export interface UpgradeDef {
  name: string;
  desc?: string;
  /** 이 개조를 해 주는 NPC 한글 이름 */
  npcs?: string[];
  /** 게임 데이터에 한글 이름이 없어 이름을 못 붙인 NPC 수 */
  npcUnknown?: number;
  ep: number;
  gold: number;
  /**
   * 이 개조를 할 수 있는 칸. "이미 한 개조 횟수" 로 적혀 있다.
   * min 0, max 0 이면 첫 칸, min 4, max 4 면 다섯 번째 칸이다.
   */
  min: number;
  max: number;
  /** [능력치, 최소, 최대, 덧붙은 값]. 체인 캐스팅은 최소/최대가 스킬 번호, 덧붙은 값이 단계다. */
  stats: [stat: string, min: number, max: number, extra?: number][];
  /** [보석 이름, 크기(cm)]. 있으면 보석 개조다. */
  gems?: [name: string, size: number][];
  /** 능력치 칸 말고 글로 적힌 효과 */
  options?: string[];
  /** 장인 개조처럼 결과가 확률로 정해지는 개조. 퍼센트 단위. */
  lucky?: {
    counts: [count: number, percent: number][];
    options: [text: string, percent: number][];
  };
  /** 전용 개조(개조한 사람에게 귀속) */
  personal?: boolean;
}

export interface AbilityDef {
  id: number;
  name: string;
  /** 값 뒤에 붙는 말. "% 증가", "초 감소" 같은 것 */
  unit: string;
  init: number;
  per: number;
  std: number;
  /** 레벨 상한 기준값: [기본, 한손 무기, 장신구] */
  lv: [base: number, oneHand: number, accessory: number];
  /** 한계 돌파가 되는 옵션인지 */
  lb: boolean;
  types: string[];
  races: string;
}

/**
 * 레벨 상한 기준값별 랭크 레벨 범위.
 * [기준값, 3랭크 최소, 최대, 2랭크 최소, 최대, 1랭크 최소, 최대, 한계 돌파 최소, 최대]
 */
export type LevelRow = [
  level: number,
  rank3Min: number,
  rank3Max: number,
  rank2Min: number,
  rank2Max: number,
  rank1Min: number,
  rank1Max: number,
  limitBreakMin: number,
  limitBreakMax: number,
];

/** [능력치, 최소, 최대, 조건이 붙었으면 1] */
export type EnchantEffect = [stat: string, min: number, max: number, conditional?: 1];

export interface EnchantDef {
  id: number;
  name: string;
  /** 0 접두, 1 접미 */
  slot: 0 | 1;
  /** 1~6 이 F~A 랭크, 7~15 가 9~1 랭크 */
  level: number;
  /** 게임 설명 문장. 조건의 뜻은 여기에만 있다 */
  desc: string[];
  effects: EnchantEffect[];
  /** 인챈트한 장비를 전용으로 만든다 */
  personal?: boolean;
}

export interface EquipmentLookup {
  item: EquipmentRecord | null;
  upgrades?: Record<string, UpgradeDef>;
  abilities?: AbilityDef[];
  enchants?: EnchantDef[];
  levels?: LevelRow[];
  /** 운영자가 이 칸을 올린 날 */
  updated?: string;
}
