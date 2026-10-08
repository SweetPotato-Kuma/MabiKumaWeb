import { describe, expect, it } from 'vitest';
import { buildKitNameIndex, kitIconIds, kitNameCandidates, resolveKitName } from './kit-names.mjs';

const items = new Map([
  ['100', { name: '나이트메어 판타지아 위치 햇' }],
  ['101', { name: '낭만 농장 황금 새싹' }],
  ['102', { name: '이름/채팅 지정 색상 변경 포션' }],
  ['103', { name: '샤말라의 변신 메달(나오)' }],
  ['104', { name: '인그레이브드 마리오네트 핸들' }],
  ['105', { name: '나이트메어 판타지아 박스' }],
  // 같은 이름이 둘이면 그림이 있는 쪽을 고른다.
  ['200', { name: '베인 풍선' }],
  ['201', { name: '베인 풍선' }],
]);
const index = buildKitNameIndex(items, (id) => id !== '200');

describe('키트 이름을 아이템 번호로 잇기', () => {
  it('판매용 머리말, 개수, 기간을 뗀 후보를 만든다', () => {
    expect(kitNameCandidates('[트렌드] 나이트메어 판타지아 위치 햇')).toContain(
      '나이트메어 판타지아 위치 햇',
    );
    expect(kitNameCandidates('낭만 농장 황금 새싹 5개')).toContain('낭만 농장 황금 새싹');
    expect(kitNameCandidates('이름/채팅 지정 색상 변경 포션 (30일)')).toContain(
      '이름/채팅 지정 색상 변경 포션',
    );
  });

  it('띄어쓰기가 달라도, 장비 사양 괄호와 인챈트 이름이 붙어도 찾는다', () => {
    expect(resolveKitName('샤말라의 변신 메달 (나오)', index)).toBe('103');
    expect(
      resolveKitName('새겨진 인그레이브드 마리오네트 핸들 (세공 1 랭크 / 경험치 500%)', index),
    ).toBe('104');
  });

  it('같은 이름이 여럿이면 그림이 있는 번호를, 없는 이름은 null 을 돌려준다', () => {
    expect(resolveKitName('베인 풍선', index)).toBe('201');
    expect(resolveKitName('행운의 붉은 개조석', index)).toBeNull();
  });

  it('키트 기록에서 상자와 보상의 번호를 모은다', () => {
    const kits = [
      {
        name: '나이트메어 판타지아 박스',
        items: [{ name: '[트렌드] 나이트메어 판타지아 위치 햇' }, { name: '없는 아이템' }],
      },
    ];
    const { ids, boxOf, itemOf } = kitIconIds(kits, index);
    expect(boxOf.get('나이트메어 판타지아 박스')).toBe('105');
    expect(itemOf.get('[트렌드] 나이트메어 판타지아 위치 햇')).toBe('100');
    expect(itemOf.has('없는 아이템')).toBe(false);
    expect([...ids].sort()).toEqual(['100', '105']);
  });
});
