// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCardMatcher } from './card-match.mjs';

const item = (id, description, extra = {}) => ({
  id,
  description,
  source: 'itemdb',
  equipType: '',
  equippable: false,
  ...extra,
});

/**
 * 2026-09 게임 데이터를 줄여 옮긴 모양. 카테고리마다 이름이 하나뿐인 아이템을 몇 개씩 두어
 * 카테고리의 모양을 배우게 한다.
 */
function fixture() {
  const candidates = new Map([
    // 검에서 배울 것: 장비이고 번호가 41000 근처
    ['롱 소드', [item(40001, '흔한 검', { equippable: true, equipType: 'OHSword' })]],
    ['클레이모어', [item(40002, '양손 검', { equippable: true, equipType: 'THSword' })]],
    // 음식에서 배울 것: 장비가 아니고 번호가 50000 근처
    ['소금', [item(50480, '짠 가루')]],
    ['설탕', [item(50481, '단 가루')]],
    ['사과', [item(50010, '빨간 사과')]],
    // 유물에서 배울 것: 장비가 아니고 번호가 12000 근처
    ['티르나노이의 창', [item(12230, '팔리아스의 보물')]],
    ['황금 거울', [item(12250, '팔리아스의 보물')]],
    // 이름이 같은 다른 물건들
    [
      '간장',
      [
        item(41189, '아처가 애용하는 검', { equippable: true }),
        item(50490, '짠맛이 나는 흑갈색 액체'),
      ],
    ],
    [
      '황금 사과',
      [
        item(12244, '훼손된 황금 사과'),
        item(50013, '황금빛의 사과다'),
        item(12241, '최상급 황금 사과'),
      ],
    ],
    ['나오의 영혼석', [item(63000, ''), item(63001, '행동 불능 상태에서만 사용할 수 있는 영혼석')]],
  ]);
  const dictionary = new Map([
    ['검', ['롱 소드', '클레이모어', '간장']],
    ['음식', ['소금', '설탕', '사과', '간장', '황금 사과']],
    ['유물', ['티르나노이의 창', '황금 거울', '황금 사과']],
    ['기타', ['나오의 영혼석']],
  ]);
  return createCardMatcher(candidates, dictionary);
}

describe('같은 이름의 게임 아이템 고르기', () => {
  it('검 카테고리의 간장에는 검을, 음식 카테고리의 간장에는 음식을 붙인다', () => {
    const matcher = fixture();

    expect(matcher.pick('간장', '검')?.description).toBe('아처가 애용하는 검');
    expect(matcher.pick('간장', '음식')?.description).toBe('짠맛이 나는 흑갈색 액체');
  });

  it('둘 다 장비가 아니면 그 카테고리 아이템들의 번호 곁에 있는 것을 고른다', () => {
    const matcher = fixture();

    expect(matcher.pick('황금 사과', '음식')?.id).toBe(50013);
    expect(matcher.pick('황금 사과', '유물')?.id).toBeLessThan(13000);
  });

  it('설명이 빈 후보보다 설명이 있는 후보를 고른다', () => {
    expect(fixture().pick('나오의 영혼석', '기타')?.id).toBe(63001);
  });

  it('후보가 하나면 그대로, 없으면 null 이다', () => {
    const matcher = fixture();

    expect(matcher.pick('롱 소드', '검')?.id).toBe(40001);
    expect(matcher.pick('없는 이름', '검')).toBeNull();
  });
});
