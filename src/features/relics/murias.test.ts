import { describe, expect, it } from 'vitest';
import {
  formatRelicValue,
  muriasAuctionPath,
  parseRelicOption,
  relicLevel,
  relicOptionOf,
  relicValueAt,
} from './murias';

describe('parseRelicOption', () => {
  it('퍼센트 옵션의 레벨을 최대치의 10분의 1 단위로 셈한다', () => {
    expect(parseRelicOption('다운비트 악센트 캐릭터 대미지 490% 추가 (최대 700%)')).toEqual({
      name: '다운비트 악센트 캐릭터 대미지',
      verb: '추가',
      value: 490,
      max: 700,
      unit: '%',
      level: 7,
    });
  });

  it('이름 안의 숫자는 이름으로 남긴다', () => {
    const relic = parseRelicOption(
      '서먼 나이트메어 속성 에너지 4개 소모 추가 대미지 배율 50% 증가 (최대 50%)',
    );
    expect(relic?.name).toBe('서먼 나이트메어 속성 에너지 4개 소모 추가 대미지 배율');
    expect(relic?.level).toBe(10);
  });

  it('초 단위와 소수 수치도 읽는다', () => {
    expect(parseRelicOption('정화의 고동 지속 시간 4.5초 증가 (최대 5초)')).toMatchObject({
      unit: '초',
      level: 9,
    });
    expect(parseRelicOption('고결한 서약 매초 희생 회복량 0.35 증가 (최대 0.5)')).toMatchObject({
      unit: '',
      level: 7,
    });
    expect(parseRelicOption('어나이얼레이션 대폭발 과열 계수 1.2 증가 (최대 3)')?.level).toBe(4);
  });

  it('모양이 다르면 null', () => {
    expect(parseRelicOption('true')).toBeNull();
    expect(parseRelicOption(undefined)).toBeNull();
  });
});

describe('relicLevel', () => {
  it('두 레벨 사이 값은 위 레벨 구간에 넣고 1~10 을 벗어나지 않는다', () => {
    expect(relicLevel(71, 700)).toBe(2);
    expect(relicLevel(70, 700)).toBe(1);
    expect(relicLevel(1, 700)).toBe(1);
    expect(relicLevel(800, 700)).toBe(10);
    expect(relicLevel(0, 700)).toBeNull();
  });
});

describe('relicValueAt / formatRelicValue', () => {
  it('레벨의 수치를 옵션 단위로 적는다', () => {
    expect(formatRelicValue({ max: 700, unit: '%' }, relicValueAt({ max: 700, unit: '%' }, 7))).toBe(
      '490%',
    );
    expect(formatRelicValue({ max: 0.5, unit: '' }, relicValueAt({ max: 0.5, unit: '' }, 7))).toBe(
      '0.35',
    );
    expect(formatRelicValue({ max: 5, unit: '초' }, relicValueAt({ max: 5, unit: '초' }, 3))).toBe(
      '1.5초',
    );
  });
});

describe('relicOptionOf', () => {
  it('옵션이 없는 매물(이데아)은 null', () => {
    expect(relicOptionOf({ item_option: null })).toBeNull();
    expect(
      relicOptionOf({
        item_option: [
          { option_type: '무리아스 유물', option_value: '플레임 버스트 대미지 45% 증가 (최대 450%)' },
          { option_type: '전용 해제 거래 보증서 사용 불가', option_value: 'true' },
        ],
      })?.level,
    ).toBe(1);
  });
});

describe('muriasAuctionPath', () => {
  it('옵션과 레벨을 경매장 주소에 싣는다', () => {
    const url = new URL(muriasAuctionPath('익시드 : 포스 슬램 대미지', 7), 'https://example.com');
    expect(url.pathname).toBe('/auction');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      category: '유물',
      relic: '익시드 : 포스 슬램 대미지',
      relicMin: '7',
      relicMax: '7',
    });
  });
});
