import { describe, expect, it } from 'vitest';
import { specialStep } from './specialUpgrade';

describe('공식 특별 개조 변경', () => {
  it('악기와 힐링 원드의 S/R 효과가 같다', () => {
    for (let level = 1; level <= 8; level++) {
      expect(specialStep('s', 211, level)).toEqual(specialStep('r', 305, level));
      expect(specialStep('s', 212, level)).toEqual(specialStep('r', 306, level));
    }
    expect(specialStep('s', 212, 8)).toEqual([['healing_potency', 20]]);
  });
  it('2026년 공식 변경의 한손 도끼와 양손 무기 수치를 적용한다', () => {
    expect(specialStep('s', 202, 1)).toEqual([
      ['attack_min', 25],
      ['attack_max', 50],
      ['bonus_damage', 2],
    ]);
    expect(specialStep('s', 203, 8)).toEqual([
      ['attack_min', 85],
      ['attack_max', 170],
      ['bonus_damage', 10],
    ]);
    expect(specialStep('r', 302, 7)).toEqual([['critical_damage', 74]]);
  });
  it('확인 못한 실린더 종류를 임의로 다른 표에 연결하지 않는다', () => {
    expect(specialStep('s', 208, 1)).toBeUndefined();
    expect(specialStep('r', 304, 1)).toBeUndefined();
  });
});
