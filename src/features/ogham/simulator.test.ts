import { describe, expect, it } from 'vitest';
import {
  activeCombinations,
  addSpent,
  emptyLines,
  meetsTargets,
  NO_SPENT,
  OGHAM_ARCANAS,
  OGHAM_COMBINATIONS,
  OGHAM_OPTIONS,
  OGHAM_WORDS,
  oghamOption,
  optionPool,
  optionTotals,
  optionValue,
  placeCombination,
  relevanceOf,
  reroll,
  rerollCost,
  rerollUntil,
  targetChance,
  type OghamLine,
  type OghamSlot,
} from './simulator';

/** 정해 둔 값을 차례로 돌려주는 난수. 다 쓰면 처음으로 돌아간다. */
const choose = (n: number, k: number) => {
  let result = 1;
  for (let index = 0; index < k; index += 1) result = (result * (n - index)) / (index + 1);
  return result;
};

const sequence = (...values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length];
};

const word = (name: string) => OGHAM_WORDS.find((each) => each.name === name)!;
const arcana = (name: string) => OGHAM_ARCANAS.find((each) => each.name === name)!;

describe('오검 워드 데이터', () => {
  it('아르카나 열 개마다 조합이 셋이고, 조합 워드는 모두 있는 워드다', () => {
    expect(OGHAM_ARCANAS).toHaveLength(10);
    for (const each of OGHAM_ARCANAS)
      expect(
        OGHAM_COMBINATIONS.filter((combination) => combination.arcana === each.id),
      ).toHaveLength(3);
    const ids = new Set(OGHAM_WORDS.map((each) => each.id));
    for (const combination of OGHAM_COMBINATIONS) {
      expect(combination.words).toHaveLength(3);
      for (const id of combination.words) expect(ids.has(id)).toBe(true);
    }
  });

  it('아르카나 옵션은 그 옵션이 붙는 워드에서만 나온다', () => {
    const arcanaCount = OGHAM_OPTIONS.filter((option) => option.arcana !== null).length;
    expect(optionPool(word('베헤'))).toHaveLength(OGHAM_OPTIONS.length);
    expect(optionPool(word('콜'))).toHaveLength(OGHAM_OPTIONS.length - arcanaCount);
  });
});

describe('옵션 무리', () => {
  it('아르카나, 메인 재능, 서브 재능, 능력치로 가르고 다른 아르카나의 스킬은 뺀다', () => {
    const knight = arcana('엘레멘탈 나이트');
    const byName = (name: string) => OGHAM_OPTIONS.find((option) => option.name === name)!;
    expect(relevanceOf(byName('파이어 리프 어택 대미지 배율 증가'), knight)).toBe('arcana');
    expect(relevanceOf(byName('스매시 대미지 배율 증가'), knight)).toBe('main');
    expect(relevanceOf(byName('파이어볼 최대 대미지 배율 증가'), knight)).toBe('sub');
    expect(relevanceOf(byName('활력의 목소리 초당 생명력 회복량 증가'), knight)).toBeNull();
    expect(relevanceOf(byName('마법 공격력 증가'), arcana('다크 메이지'))).toBe('stat');
  });

  it('수치는 최대 레벨 수치를 레벨에 비례해 나눈다', () => {
    const smash = OGHAM_OPTIONS.find((option) => option.name === '스매시 대미지 배율 증가')!;
    expect(optionValue(smash, smash.maxLevel)).toBe(smash.value);
    expect(optionValue(smash, 1)).toBe(smash.value / smash.maxLevel);
  });
});

describe('재설정', () => {
  const pool = optionPool(word('콜'));

  it('잠근 줄은 그대로 두고 남은 줄에 겹치지 않는 옵션을 붙인다', () => {
    const locked: OghamLine = { option: pool[0].id, level: 3, locked: true };
    // 언제나 맨 앞을 고르게 하면, 잠근 옵션을 뺀 목록의 앞에서부터 차례로 붙는다.
    const lines = reroll([locked, null, null], pool, () => 0);
    expect(lines[0]).toBe(locked);
    expect(lines[1]?.option).toBe(pool[1].id);
    expect(lines[2]?.option).toBe(pool[2].id);
    expect(lines[1]?.level).toBe(1);
  });

  it('잠근 줄 수에 따라 비용이 오르고, 셋 다 잠그면 재설정할 수 없다', () => {
    expect(rerollCost(0)?.gold).toBe(5000);
    expect(rerollCost(1)?.gold).toBe(10000);
    expect(rerollCost(2)?.gold).toBe(20000);
    expect(rerollCost(3)).toBeNull();
  });

  it('비용은 잠근 줄 수의 비용을 횟수만큼 더한다', () => {
    const spent = addSpent(addSpent(NO_SPENT, 0, 4), 1, 2);
    expect(spent.count).toBe(6);
    expect(spent.gold).toBe(4 * 5000 + 2 * 10000);
    expect(spent.materials['오검 파편']).toBe(4 * 1 + 2 * 3);
    expect(spent.materials['불타래']).toBe(2);
  });

  it('목표 옵션이 나오면 멈추고 몇 번 만에 나왔는지 돌려준다', () => {
    const targets = [{ option: pool[5].id, minLevel: 1 }];
    // 첫 번째는 앞의 셋, 두 번째에 다섯 번째 옵션이 첫 줄로 나온다.
    const random = sequence(0, 0, 0, 0, 0, 0, 5 / pool.length + 1e-6, 0, 0, 0, 0, 0);
    const run = rerollUntil(emptyLines(), pool, targets, 10, random);
    expect(run.hit).toBe(true);
    expect(run.tries).toBe(2);
    expect(meetsTargets(run.lines, targets)).toBe(true);
  });

  it('목표가 여럿이면 하나라도 나오면 멈춘다', () => {
    // 언제나 앞의 셋이 나온다. 그 가운데 하나만 목표에 있어도 한 번에, 하나도 없으면 끝내 못 채운다.
    const one = [pool[2], pool[9]].map((option) => ({ option: option.id, minLevel: 1 }));
    expect(rerollUntil(emptyLines(), pool, one, 5, () => 0)).toMatchObject({
      hit: true,
      tries: 1,
    });
    const none = [pool[8], pool[9]].map((option) => ({ option: option.id, minLevel: 1 }));
    expect(rerollUntil(emptyLines(), pool, none, 5, () => 0)).toMatchObject({
      hit: false,
      tries: 5,
    });
  });

  it('잠근 줄에 있는 목표는 나온 것으로 치지 않는다', () => {
    const held: OghamLine = { option: pool[0].id, level: 1, locked: true };
    const targets = [{ option: pool[0].id, minLevel: 1 }];
    expect(meetsTargets([held, null, null], targets)).toBe(false);
  });

  it('목표가 끝내 나오지 않으면 상한만큼 돌리고 멈춘다', () => {
    const run = rerollUntil(emptyLines(), pool, [{ option: pool[9].id, minLevel: 1 }], 7, () => 0);
    expect(run).toMatchObject({ hit: false, tries: 7 });
  });

  it('목표가 없으면 한 번만 재설정한다', () => {
    expect(rerollUntil(emptyLines(), pool, [], 7, () => 0)).toMatchObject({ hit: true, tries: 1 });
  });

  it('한 번에 목표가 나올 확률은 열린 줄 수를 남은 옵션 수로 나누고 레벨 몫을 곱한다', () => {
    const option = pool[4];
    const half = Math.ceil(option.maxLevel / 2);
    expect(targetChance(emptyLines(), pool, [{ option: option.id, minLevel: 1 }])).toBeCloseTo(
      3 / pool.length,
    );
    const locked: OghamLine = { option: pool[0].id, level: 1, locked: true };
    expect(
      targetChance([locked, null, null], pool, [{ option: option.id, minLevel: half }]),
    ).toBeCloseTo((2 / (pool.length - 1)) * ((option.maxLevel - half + 1) / option.maxLevel));
  });

  it('목표 여럿은 그 가운데 하나라도 레벨을 채워 뽑힐 확률이다', () => {
    const [a, b] = [pool[4], pool[6]];
    const both = [
      { option: a.id, minLevel: 1 },
      { option: b.id, minLevel: b.maxLevel },
    ];
    const n = pool.length;
    // a 가 뽑히거나, a 없이 b 가 뽑혀 최대 레벨이 나오거나.
    const withoutA = choose(n - 2, 2) / choose(n, 3);
    expect(targetChance(emptyLines(), pool, both)).toBeCloseTo(3 / n + withoutA / b.maxLevel);
  });

  it('잠근 줄에 묶인 목표는 빼고 세며, 남은 목표가 없으면 0 이다', () => {
    const held: OghamLine = { option: pool[0].id, level: 5, locked: true };
    const lines = [held, null, null];
    const other = { option: pool[4].id, minLevel: 1 };
    // pool[0] 은 잠근 줄에 있으니 pool[4] 만 남은 두 줄에 들면 된다.
    expect(targetChance(lines, pool, [{ option: pool[0].id, minLevel: 5 }, other])).toBeCloseTo(
      2 / (pool.length - 1),
    );
    expect(targetChance(lines, pool, [{ option: pool[0].id, minLevel: 6 }])).toBe(0);
    const twoLocked = [held, { option: pool[1].id, level: 1, locked: true }, null];
    expect(targetChance(twoLocked, pool, [other, { option: pool[5].id, minLevel: 1 }])).toBeCloseTo(
      2 / (pool.length - 2),
    );
  });
});

describe('조합', () => {
  const knight = arcana('엘레멘탈 나이트');
  const [first] = OGHAM_COMBINATIONS.filter((combination) => combination.arcana === knight.id);
  const empty: (OghamSlot | null)[] = [null, null, null, null, null];

  it('조합 워드를 빈 칸에 넣으면 그 조합이 발동한다', () => {
    const slots = placeCombination(empty, first);
    expect(slots.filter(Boolean)).toHaveLength(3);
    expect(activeCombinations(knight.id, slots).map((combination) => combination.id)).toEqual([
      first.id,
    ]);
    // 다른 아르카나에게는 발동하지 않는다.
    expect(activeCombinations(arcana('세인트 바드').id, slots)).toEqual([]);
  });

  it('이미 들어 있는 워드는 다시 넣지 않는다', () => {
    const one = [{ word: first.words[1], lines: emptyLines() }, null, null, null, null];
    const slots = placeCombination(one, first);
    expect(
      slots
        .filter(Boolean)
        .map((slot) => slot!.word)
        .sort(),
    ).toEqual([...first.words].sort());
  });

  it('옵션 합계는 같은 옵션을 더하고 그 아르카나에게 쓸모 있는 옵션을 앞에 둔다', () => {
    const smash = OGHAM_OPTIONS.find((option) => option.name === '스매시 대미지 배율 증가')!;
    const other = OGHAM_OPTIONS.find((option) => option.name === '힐링 생명력 최대 회복량 증가')!;
    const slots: (OghamSlot | null)[] = [
      { word: 9, lines: [{ option: other.id, level: 10, locked: false }, null, null] },
      { word: 10, lines: [{ option: smash.id, level: 2, locked: false }, null, null] },
      { word: 11, lines: [{ option: smash.id, level: 3, locked: false }, null, null] },
      null,
      null,
    ];
    const totals = optionTotals(slots, knight);
    expect(totals.map((total) => total.option.id)).toEqual([smash.id, other.id]);
    expect(totals[0].levelSum).toBe(5);
    expect(totals[0].valueSum).toBe(optionValue(oghamOption(smash.id), 5));
  });
});
