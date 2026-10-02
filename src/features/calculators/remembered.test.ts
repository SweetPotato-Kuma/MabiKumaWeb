import { beforeEach, describe, expect, it } from 'vitest';
import type { Field } from './schema';
import { remember, withRemembered } from './remembered';
import { defaultValues } from './schema';

const fields: readonly Field[] = [
  { type: 'gold', key: 'price', label: '판매가', default: 100 },
  { type: 'toggle', key: 'premium', label: '멤버십', default: false, remember: true },
  { type: 'gold', key: 'c10', label: '10% 쿠폰 값', default: null, remember: true },
];

const none = new URLSearchParams();

beforeEach(() => {
  window.localStorage.clear();
});

describe('내 설정으로 기억하는 입력', () => {
  it('저장한 적이 없으면 주소로 읽은 값 그대로다', () => {
    const base = defaultValues(fields);

    expect(withRemembered('fee', fields, base, none)).toEqual(base);
  });

  it('기억 칸만 저장하고, 판매가 같은 칸은 저장하지 않는다', () => {
    remember('fee', fields, { price: 999, premium: true, c10: 500_000 });

    const restored = withRemembered('fee', fields, defaultValues(fields), none);

    expect(restored).toEqual({ price: 100, premium: true, c10: 500_000 });
  });

  it('주소에 값이 있으면 주소가 이기고, 없는 칸만 저장값으로 채운다', () => {
    remember('fee', fields, { price: 100, premium: true, c10: 500_000 });
    const params = new URLSearchParams('c10=7000');
    const fromUrl = { price: 100, premium: false, c10: 7000 };

    const values = withRemembered('fee', fields, fromUrl, params);

    expect(values.c10).toBe(7000);
    expect(values.premium).toBe(true);
  });

  it('기본값으로 돌린 칸은 저장에서 빠져 지운 것과 같다', () => {
    remember('fee', fields, { price: 100, premium: true, c10: 500_000 });
    remember('fee', fields, { price: 100, premium: false, c10: null });

    expect(window.localStorage.getItem('mabikuma:calc:fee')).toBeNull();
    expect(withRemembered('fee', fields, defaultValues(fields), none)).toEqual(defaultValues(fields));
  });

  it('계산기마다 따로 저장한다', () => {
    remember('fee', fields, { price: 100, premium: true, c10: null });

    expect(withRemembered('other', fields, defaultValues(fields), none).premium).toBe(false);
  });

  it('깨진 저장값은 버리고 기본값으로 둔다', () => {
    window.localStorage.setItem('mabikuma:calc:fee', 'c10=abc&premium=maybe');

    expect(withRemembered('fee', fields, defaultValues(fields), none)).toEqual(defaultValues(fields));
  });

  it('기억 칸이 없는 계산기는 건드리지 않는다', () => {
    const plain: readonly Field[] = [{ type: 'gold', key: 'price', label: '판매가', default: 1 }];
    remember('plain', plain, { price: 5 });

    expect(window.localStorage.getItem('mabikuma:calc:plain')).toBeNull();
    expect(withRemembered('plain', plain, { price: 1 }, none)).toEqual({ price: 1 });
  });
});
