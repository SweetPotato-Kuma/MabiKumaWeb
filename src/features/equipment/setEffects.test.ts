import { describe, expect, it } from 'vitest';
import {
  describeContribution,
  formatSetRange,
  itemSetEffects,
  type SetEffectData,
} from './setEffects';

const SAMPLE: SetEffectData = {
  updated: '2026-10-01',
  effects: {
    continuityattack_probability: {
      name: '연속 공격 발동 확률 증가',
      desc: '연속 공격 발동 확률 1% 증가',
      need: 10,
    },
    poison_immune: { name: '독 면역', desc: '독 계열 컨디션 방지', need: 10 },
  },
  items: {
    '얼티밋 기아스 데버스테이션 써클릿': [['continuityattack_probability', 3, 5]],
    '얼티밋 기아스 데버스테이션 글러브': [['continuityattack_probability', 3, 5]],
    '대여용 얼티밋 기아스 데버스테이션 글러브': [['continuityattack_probability', 3, 3]],
    '랑그히리스 체이서 아머 (남성용)': [
      ['poison_immune', 2, 2],
      ['poison_immune', 1, 1, 90],
    ],
  },
};

describe('장비 하나의 세트 효과', () => {
  it('효과마다 이 장비의 수치와 같은 효과를 주는 다른 장비를 모은다', () => {
    const [effect, ...rest] = itemSetEffects(SAMPLE, '얼티밋 기아스 데버스테이션 써클릿');
    expect(rest).toEqual([]);
    expect(effect.def.name).toBe('연속 공격 발동 확률 증가');
    expect(effect.own).toEqual({ min: 3, max: 5, bonus: [] });
    // 최대 수치가 큰 것부터, 같으면 이름 순.
    expect(effect.others.map((other) => other.name)).toEqual([
      '얼티밋 기아스 데버스테이션 글러브',
      '대여용 얼티밋 기아스 데버스테이션 글러브',
    ]);
  });

  it('품질 조건 수치는 따로 둔다', () => {
    const [effect] = itemSetEffects(SAMPLE, '랑그히리스 체이서 아머 (남성용)');
    expect(effect.own).toEqual({ min: 2, max: 2, bonus: [{ quality: 90, min: 1, max: 1 }] });
    expect(describeContribution(effect.own)).toBe('+2 (품질 90 이상 +1)');
  });

  it('띄어쓰기만 다른 이름도 찾는다', () => {
    expect(itemSetEffects(SAMPLE, '랑그히리스 체이서 아머(남성용)')).toHaveLength(1);
  });

  it('세트 효과가 없는 장비는 빈 목록이다', () => {
    expect(itemSetEffects(SAMPLE, '소울 리버레이트 소드')).toEqual([]);
  });

  it('수치는 같으면 하나로, 다르면 폭으로 적는다', () => {
    expect(formatSetRange(3, 3)).toBe('+3');
    expect(formatSetRange(3, 5)).toBe('+3~5');
  });
});
