import { describe, expect, it } from 'vitest';
import type { Field } from './schema';
import { MAX_GOLD, readValues, writeValues } from './url';

const FIELDS: Field[] = [
  { type: 'gold', key: 'price', label: '가격', default: 100_000_000 },
  { type: 'gold', key: 'coupon', label: '쿠폰', default: null, autoFill: '쿠폰' },
  { type: 'number', key: 'people', label: '인원', default: 1, min: 1, max: 8 },
  { type: 'toggle', key: 'premium', label: '프리미엄', default: false },
  { type: 'toggle', key: 'fast', label: '빠르게', default: true },
  {
    type: 'choice',
    key: 'mode',
    label: '방식',
    default: 'a',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
  },
  { type: 'item', key: 'item', label: '아이템', default: '' },
];

const params = (query: string) => new URLSearchParams(query);

describe('계산기 주소', () => {
  it('주소가 비면 기본값이다', () => {
    expect(readValues(FIELDS, params(''))).toEqual({
      price: 100_000_000,
      coupon: null,
      people: 1,
      premium: false,
      fast: true,
      mode: 'a',
      item: '',
    });
  });

  it('칸마다 읽는다', () => {
    const values = readValues(
      FIELDS,
      params('price=250000000&coupon=3000&people=4&premium=1&fast=0&mode=b&item=소드'),
    );

    expect(values).toEqual({
      price: 250_000_000,
      coupon: 3000,
      people: 4,
      premium: true,
      fast: false,
      mode: 'b',
      item: '소드',
    });
  });

  it('형식이 틀린 값은 그 칸만 기본으로 돌린다', () => {
    const values = readValues(FIELDS, params('price=abc&coupon=-5&people=x&premium=yes&mode=zzz&fast=0'));

    expect(values).toMatchObject({
      price: 100_000_000,
      coupon: null,
      people: 1,
      premium: false,
      mode: 'a',
      fast: false,
    });
  });

  it('범위를 넘는 값은 끝으로 당기고, 금액은 상한을 넘으면 버린다', () => {
    expect(readValues(FIELDS, params('people=99')).people).toBe(8);
    expect(readValues(FIELDS, params('people=0')).people).toBe(1);
    expect(readValues(FIELDS, params(`price=${MAX_GOLD * 10}`)).price).toBe(100_000_000);
  });

  it('금액은 소수를 버린다', () => {
    expect(readValues(FIELDS, params('price=1234.9')).price).toBe(1234);
  });

  it('기본값과 같은 칸은 주소에 쓰지 않는다', () => {
    const next = writeValues(FIELDS, readValues(FIELDS, params('')));

    expect(next.toString()).toBe('');
  });

  it('바뀐 칸만 쓰고, 읽으면 그대로 돌아온다', () => {
    const values = {
      price: 5_000_000,
      coupon: 1200,
      people: 3,
      premium: true,
      fast: false,
      mode: 'b',
      item: '롱 소드',
    };
    const next = writeValues(FIELDS, values);

    expect(next.get('price')).toBe('5000000');
    expect(next.get('fast')).toBe('0');
    expect(readValues(FIELDS, next)).toEqual(values);
  });

  it('시세 자동(null)인 칸은 쓰지 않고, 기존 다른 쿼리는 그대로 둔다', () => {
    const next = writeValues(FIELDS, readValues(FIELDS, params('')), params('tab=x&price=1&coupon=5'));

    expect(next.has('coupon')).toBe(false);
    expect(next.has('price')).toBe(false);
    expect(next.get('tab')).toBe('x');
  });
});
