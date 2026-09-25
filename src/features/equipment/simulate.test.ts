import { describe, expect, it } from 'vitest';
import {
  computeStats,
  decodeState,
  encodeState,
  initialState,
  selectedSpecial,
  selectedUpgrades,
  upgradeCost,
  upgradesForSlot,
} from './simulate';
import type {
  AbilityDef,
  EnchantDef,
  EquipmentRecord,
  ErgSet,
  LevelRow,
  UpgradeDef,
} from './types';

/** 소울 리버레이트 소드. 2026-09 게임 데이터에서 뽑은 값을 줄여 옮겼다. */
const SWORD: EquipmentRecord = {
  id: 1000059,
  name: '소울 리버레이트 소드',
  category: '검',
  base: {
    attack_min: 89,
    attack_max: 139,
    wound_min: 20,
    wound_max: 35,
    critical: 10,
    balance: 77,
    durability: 20,
  },
  random: [
    ['attack_min', 0, 10],
    ['attack_max', 0, 10],
    ['critical', 0, 10],
  ],
  upgrade: { max: 5, gemMax: 1, ids: [52472, 52500, 52506, 52507, 52509] },
  reforge: { type: 'OHSword', races: 'heg' },
  special: { s: 201, r: 301, max: 8 },
};

const UPGRADES: Record<string, UpgradeDef> = {
  52472: {
    name: '보석 개조',
    ep: 100,
    gold: 45000,
    min: 0,
    max: 0,
    stats: [
      ['attack_max', 2, 2],
      ['critical', 3, 3],
    ],
    gems: [['루비', 5]],
  },
  52500: {
    name: '검신 다듬기1',
    ep: 40,
    gold: 40000,
    min: 1,
    max: 1,
    stats: [
      ['balance', -2, -2],
      ['attack_max', 14, 14],
      ['attack_min', 14, 14],
    ],
  },
  52506: { name: '칼날 갈기', ep: 23, gold: 33000, min: 1, max: 2, stats: [['critical', 4, 4]] },
  52507: {
    name: '소울 리버레이트 소드 전용 개조 1',
    ep: 100,
    gold: 99000,
    min: 0,
    max: 0,
    stats: [['attack_max', 30, 30]],
  },
  52509: {
    name: '장인 개조',
    ep: 100,
    gold: 50000,
    min: 4,
    max: 4,
    stats: [],
    lucky: { counts: [[2, 30]], options: [['최대 대미지 18~38 증가', 50]] },
  },
};

const ABILITIES: AbilityDef[] = [
  {
    id: 1,
    name: '체력',
    unit: '증가',
    init: 1.5,
    per: 1.5,
    std: 1,
    lv: [20, 10, 5],
    lb: true,
    types: ['OHSword'],
    races: 'heg',
  },
];
const LEVELS: LevelRow[] = [[10, 1, 3, 1, 6, 1, 10, 11, 12]];

/** 거침없는(접두)과 파머(접미). 효과는 2026-09 게임 데이터 그대로다. */
const ENCHANTS: EnchantDef[] = [
  {
    id: 21643,
    name: '거침없는',
    slot: 0,
    level: 10,
    desc: ['윈드밀 랭크 3단 이상일 때 최대 대미지 50~60 증가', '최대 생명력 100 증가'],
    effects: [
      ['attack_max', 50, 60, 1],
      ['life_max', 100, 100],
    ],
    personal: true,
  },
  {
    id: 10604,
    name: '파머',
    slot: 1,
    level: 1,
    desc: ['[체력 1~3 감소]'],
    effects: [['str', -3, -1]],
  },
];

describe('개조 칸', () => {
  it('칸 번호에 맞는 일반 개조만 고를 수 있다', () => {
    const first = upgradesForSlot(SWORD, UPGRADES, 0, false).map(([id]) => id);
    const second = upgradesForSlot(SWORD, UPGRADES, 1, false).map(([id]) => id);
    const fifth = upgradesForSlot(SWORD, UPGRADES, 4, false).map(([id]) => id);

    expect(first).toEqual([52507]);
    expect(second).toEqual([52500, 52506]);
    expect(fifth).toEqual([52509]);
  });

  it('목록에 같은 개조가 두 번 있어도 선택지는 하나다', () => {
    const doubled = { ...SWORD, upgrade: { max: 5, gemMax: 1, ids: [52507, 52507] } };
    expect(upgradesForSlot(doubled, UPGRADES, 0, false).map(([id]) => id)).toEqual([52507]);
  });

  it('보석 개조는 보석 칸에만 들어간다', () => {
    expect(upgradesForSlot(SWORD, UPGRADES, 0, true).map(([id]) => id)).toEqual([52472]);
    expect(upgradesForSlot(SWORD, UPGRADES, 0, false).map(([id]) => id)).not.toContain(52472);
  });
});

describe('능력치 합산', () => {
  it('아무것도 고르지 않으면 기본 능력치에 유동 최솟값을 더한 값이다', () => {
    const rows = computeStats(SWORD, UPGRADES, initialState(SWORD));
    const attackMax = rows.find((row) => row.stat === 'attack_max');
    expect(attackMax).toMatchObject({ base: 139, random: 0, total: [139, 139] });
  });

  it('유동 값과 고른 개조를 칸별로 나눠 더한다', () => {
    const state = initialState(SWORD);
    state.random.attack_max = 10;
    state.slots = [52507, 52500, null, null, null];
    state.gemSlots = [52472];

    const attackMax = computeStats(SWORD, UPGRADES, state).find((row) => row.stat === 'attack_max');
    expect(attackMax).toMatchObject({
      base: 139,
      random: 10,
      upgrade: [46, 46],
      total: [195, 195],
    });

    const balance = computeStats(SWORD, UPGRADES, state).find((row) => row.stat === 'balance');
    expect(balance?.total[0]).toBe(75);
  });

  it('게임 표기 순서로 늘어놓는다', () => {
    const stats = computeStats(SWORD, UPGRADES, initialState(SWORD)).map((row) => row.stat);
    expect(stats.slice(0, 3)).toEqual(['attack_min', 'attack_max', 'wound_min']);
  });

  it('체인 캐스팅은 스킬 번호가 들어 있어 더하지 않는다', () => {
    const wand: EquipmentRecord = {
      id: 1,
      name: '원드',
      category: '원드',
      upgrade: { max: 1, gemMax: 0, ids: [9] },
    };
    const upgrades: Record<string, UpgradeDef> = {
      9: {
        name: '체인',
        ep: 0,
        gold: 0,
        min: 0,
        max: 0,
        stats: [['chain_casting', 30101, 30101, 1]],
      },
    };
    const state = initialState(wand);
    state.slots = [9];
    expect(computeStats(wand, upgrades, state)).toEqual([]);
  });

  it('고른 개조의 숙련과 비용을 더한다', () => {
    const state = initialState(SWORD);
    state.slots = [52507, 52506, 52506, null, null];
    expect(upgradeCost(selectedUpgrades(state, UPGRADES))).toEqual({ ep: 146, gold: 165000 });
  });
});

describe('인챈트와 특별 개조', () => {
  it('고른 인챈트의 효과를 인챈트 칸에 범위로 더한다', () => {
    const state = initialState(SWORD);
    state.enchant = { prefix: 21643, suffix: 10604, conditional: true };

    const rows = computeStats(SWORD, UPGRADES, state, ENCHANTS);
    expect(rows.find((row) => row.stat === 'attack_max')).toMatchObject({
      enchant: [50, 60],
      total: [189, 199],
    });
    expect(rows.find((row) => row.stat === 'str')).toMatchObject({
      enchant: [-3, -1],
      total: [-3, -1],
    });
  });

  it('조건 붙은 효과를 빼라고 하면 조건 없는 효과만 더한다', () => {
    const state = initialState(SWORD);
    state.enchant = { prefix: 21643, suffix: null, conditional: false };

    const rows = computeStats(SWORD, UPGRADES, state, ENCHANTS);
    expect(rows.find((row) => row.stat === 'attack_max')?.enchant).toEqual([0, 0]);
    expect(rows.find((row) => row.stat === 'life_max')?.total).toEqual([100, 100]);
  });

  it('특별 개조 S 는 종류 번호의 표에서 단계 수치를 더한다', () => {
    const state = initialState(SWORD);
    state.special = { kind: 's', level: 7 };

    // S201 한손 무기 7단계: 최소 +60, 최대 +120, 보너스 대미지 +5%
    const rows = computeStats(SWORD, UPGRADES, state, ENCHANTS);
    expect(rows.find((row) => row.stat === 'attack_max')).toMatchObject({
      special: 120,
      total: [259, 259],
    });
    expect(rows.find((row) => row.stat === 'bonus_damage')?.total).toEqual([5, 5]);
  });

  it('표에 비어 있는 단계는 아무것도 더하지 않는다', () => {
    const state = initialState(SWORD);
    state.special = { kind: 'r', level: 8 };

    expect(selectedSpecial(SWORD, state)).toBeNull();
    expect(
      computeStats(SWORD, UPGRADES, state).find((row) => row.stat === 'critical_damage'),
    ).toBeUndefined();
  });
});

describe('에르그', () => {
  /** 한손검 묶음을 줄였다. S 50레벨: 무기 공격력 25, 방어/보호 25. */
  const SWORD_ERG: ErgSet = {
    S: {
      effects: ['무기 공격력 {0} 증가', '방어, 보호, 마법방어, 마법보호 {0} 증가'],
      levels: [[1], [25, 25]],
    },
    D: { effects: ['배쉬 대미지 {0}% 증가'], levels: [[1.5], [75]] },
  };

  it('무기 공격력은 최소와 최대 공격력 모두에 에르그 칸으로 더한다', () => {
    const state = initialState(SWORD);
    state.erg = { grade: 'S', level: 2 };

    const rows = computeStats(SWORD, UPGRADES, state, [], SWORD_ERG);
    expect(rows.find((row) => row.stat === 'attack_min')).toMatchObject({
      erg: 25,
      total: [114, 114],
    });
    expect(rows.find((row) => row.stat === 'attack_max')).toMatchObject({
      erg: 25,
      total: [164, 164],
    });
    expect(rows.find((row) => row.stat === 'protect')?.total).toEqual([25, 25]);
  });

  it('어둠의 에르그는 S 등급 끝 레벨 능력치를 그대로 가진다', () => {
    const state = initialState(SWORD);
    state.erg = { grade: 'D', level: 1 };
    const rows = computeStats(SWORD, UPGRADES, state, [], SWORD_ERG);
    expect(rows.find((row) => row.stat === 'attack_max')?.erg).toBe(25);
  });

  it('주소를 한 바퀴 돌아도 그대로이고 폭 밖의 레벨은 폭 안으로 넣는다', () => {
    const state = initialState(SWORD);
    state.erg = { grade: 'D', level: 2 };
    const params = encodeState(SWORD, state);
    expect(params.eg).toBe('D2');
    expect(
      decodeState(params, SWORD, UPGRADES, ABILITIES, LEVELS, ENCHANTS, SWORD_ERG).erg,
    ).toEqual(state.erg);
    expect(
      decodeState({ eg: 'S99' }, SWORD, UPGRADES, ABILITIES, LEVELS, ENCHANTS, SWORD_ERG).erg,
    ).toEqual({ grade: 'S', level: 2 });
    // 이 장비에 없는 등급은 버린다.
    expect(
      decodeState({ eg: 'A10' }, SWORD, UPGRADES, ABILITIES, LEVELS, ENCHANTS, SWORD_ERG).erg,
    ).toEqual({ grade: null, level: 0 });
  });
});

describe('링크로 저장하고 불러오기', () => {
  it('고른 조합이 주소를 한 바퀴 돌아도 그대로다', () => {
    const state = initialState(SWORD);
    state.random = { attack_min: 3, attack_max: 10, critical: 0 };
    state.slots = [52507, 52500, 52506, null, 52509];
    state.gemSlots = [52472];
    state.reforge = { rank: 1, options: [{ abilityId: 1, level: 12 }] };
    state.special = { kind: 'r', level: 7 };
    state.enchant = { prefix: 21643, suffix: 10604, conditional: false };

    const params = encodeState(SWORD, state);
    expect(decodeState(params, SWORD, UPGRADES, ABILITIES, LEVELS, ENCHANTS)).toEqual(state);
  });

  it('고른 것이 없으면 주소에 아무것도 붙이지 않는다', () => {
    expect(encodeState(SWORD, initialState(SWORD))).toEqual({});
  });

  it('맞지 않는 값은 버리고 폭 밖의 값은 폭 안으로 넣는다', () => {
    const state = decodeState(
      { rv: '99.-5.x', up: '52509.52500', rf: '3_1-50.777-1', sp: 's20' },
      SWORD,
      UPGRADES,
      ABILITIES,
      LEVELS,
    );

    expect(state.random).toEqual({ attack_min: 10, attack_max: 0, critical: 0 });
    // 장인 개조는 다섯 번째 칸 개조라 첫 칸에 들어갈 수 없다.
    expect(state.slots).toEqual([null, 52500, null, null, null]);
    // 세공 랭크는 하나로 합쳐져 예전 3랭크 링크도 1랭크로 읽는다. 1랭크는 한계 돌파까지 12 레벨이다.
    // 없는 옵션 777 은 버린다.
    expect(state.reforge).toEqual({ rank: 1, options: [{ abilityId: 1, level: 12 }] });
    expect(state.special).toEqual({ kind: 's', level: 8 });
  });

  it('접두 자리에 접미 인챈트를 넣은 주소는 버린다', () => {
    const state = decodeState({ en: '10604.21643' }, SWORD, UPGRADES, ABILITIES, LEVELS, ENCHANTS);
    expect(state.enchant).toEqual({ prefix: null, suffix: null, conditional: true });
  });
});
