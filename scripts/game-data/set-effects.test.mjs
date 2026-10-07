// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildSetEffects, cleanSetDesc } from './set-effects.mjs';

/** client-tables.mjs 가 돌려주는 모양을 줄여 만든다. 값은 2026-10 게임 데이터에서 옮겼다. */
const RESOURCE = {
  StringTable: [
    { Id: 'itemdb.1', Str: '얼티밋 기아스 데버스테이션 써클릿' },
    { Id: 'itemdb.2', Str: '라바 캣 로브' },
    { Id: 'setitemdesc.87', Str: '연속 공격 발동 확률 증가' },
    {
      Id: 'setitemdesc.187',
      Str: '연속 공격 발동 확률 1% 증가\\n(다른 세트와 중복 시 더 큰 값이 적용됨)',
    },
    { Id: 'setitemdesc.1', Str: '독 면역' },
    { Id: 'setitemdesc.126', Str: '독 계열 컨디션 방지' },
    { Id: 'setitemdesc.114', Str: 'not found key, setitemdesc.114' },
    { Id: 'setitemdesc.200', Str: '헤일 스톰 대미지 15% 증가' },
    { Id: 'setitemdesc.471', Str: '최대 대미지 증가' },
    { Id: 'setitemdesc.472', Str: '최대 대미지 {0} 증가' },
  ],
  ItemList: [
    { Id: 18705, Name: 'itemdb.1' },
    { Id: 2210012, Name: 'itemdb.1' },
    { Id: 13038, Name: 'itemdb.2' },
    { Id: 14163, Name: 'itemdb.999' },
  ],
  SetItemDescElementList: [
    {
      Key: 'continuityattack_probability',
      Name: 'setitemdesc.87',
      Desc: 'setitemdesc.187',
      ThresholdCount: 10,
    },
    { Key: 'poison_immune', Name: 'setitemdesc.1', Desc: 'setitemdesc.126', ThresholdCount: 10 },
    {
      Key: 'hailstorm_enhance',
      Name: 'setitemdesc.114',
      Desc: 'setitemdesc.200',
      ThresholdCount: 10,
    },
    {
      Key: 'MaxDamagePlus_15',
      Name: 'setitemdesc.471',
      Desc: 'setitemdesc.472',
      ThresholdCount: 10,
    },
    { Key: 'stone_immune', Name: 'setitemdesc.1', Desc: 'setitemdesc.126', ThresholdCount: 10 },
  ],
  ItemExtendSetItemDescList: [
    { Id: 18705, Elements: [{ Name: 'continuityattack_probability', Min: 3, Max: 5 }] },
    // 같은 이름의 다른 번호. 먼저 나온 것을 쓴다.
    { Id: 2210012, Elements: [{ Name: 'continuityattack_probability', Min: 1, Max: 1 }] },
    {
      Id: 13038,
      Elements: [
        { Name: 'poison_immune', Min: 2, Max: 2 },
        { Name: 'hailstorm_enhance', Max: 3 },
        { Name: 'MaxDamagePlus_15', Min: 1, Max: 1 },
      ],
      QualityElements: [{ Quality: 90, Elements: [{ Name: 'poison_immune', Min: 1, Max: 1 }] }],
    },
    // 이름 없는 번호는 사전에서 열 수 없다.
    { Id: 14163, Elements: [{ Name: 'poison_immune', Min: 3, Max: 3 }] },
  ],
};

describe('세트 효과 표', () => {
  const { effects, items } = buildSetEffects(RESOURCE);

  it('아이템 이름별로 효과 키와 수치를 묶는다', () => {
    expect(items['얼티밋 기아스 데버스테이션 써클릿']).toEqual([
      ['continuityattack_probability', 3, 5],
    ]);
    expect(items['라바 캣 로브']).toEqual([
      ['poison_immune', 2, 2],
      ['hailstorm_enhance', 0, 3],
      ['MaxDamagePlus_15', 1, 1],
      ['poison_immune', 1, 1, 90],
    ]);
    expect(Object.keys(items)).toHaveLength(2);
  });

  it('효과의 이름, 줄을 나눈 설명, 발동 기준을 싣는다', () => {
    expect(effects.continuityattack_probability).toEqual({
      name: '연속 공격 발동 확률 증가',
      desc: '연속 공격 발동 확률 1% 증가\n(다른 세트와 중복 시 더 큰 값이 적용됨)',
      need: 10,
    });
  });

  it('이름이 빠진 효과는 설명을 이름으로 쓰고 설명을 되풀이하지 않는다', () => {
    expect(effects.hailstorm_enhance).toEqual({
      name: '헤일 스톰 대미지 15% 증가',
      desc: '',
      need: 10,
    });
    expect(effects.MaxDamagePlus_15).toEqual({ name: '최대 대미지 증가', desc: '', need: 10 });
  });

  it('아무 아이템도 쓰지 않는 효과는 뺀다', () => {
    expect(effects.stone_immune).toBeUndefined();
  });
});

describe('세트 효과 설명 다듬기', () => {
  it('값이 데이터에 없는 자리는 단위째 뺀다', () => {
    expect(cleanSetDesc('이동 속도 {0}% 증가')).toBe('이동 속도 증가');
    expect(cleanSetDesc('유효 사거리 [int:ATKRANGE]cm 증가')).toBe('유효 사거리 증가');
    expect(cleanSetDesc('음악 버프 지속 시간 [int:MusicTime]초 증가')).toBe(
      '음악 버프 지속 시간 증가',
    );
  });

  it('글자로 적힌 줄바꿈을 줄로 나눈다', () => {
    expect(cleanSetDesc('자폭 피해 80% 감소\\\\n다운 방지')).toBe('자폭 피해 80% 감소\n다운 방지');
  });
});
