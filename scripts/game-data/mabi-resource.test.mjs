// @vitest-environment node
import { brotliCompressSync, constants } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseItemReference } from './mabi-resource.mjs';

/**
 * 이 파서는 공개된 스키마가 아니라 **관측**에 기대고 있다. ItemList 가 최상위 필드 11 이고
 * StringTable 이 23 이라는 것은 각 데이터셋의 행 수를 세어 알아낸 값이다. 남의 프로젝트가
 * 만드는 파일이라 언제든 바뀔 수 있으므로, 여기서 형식을 직접 만들어 넣어 본다.
 *
 * 실제 덩어리(7.4MB)를 픽스처로 넣지 않는 이유는 두 가지다. 저장소에 바이너리가 쌓이고,
 * 받아 온 시점의 게임 데이터에 테스트가 묶인다.
 */

function varint(value) {
  const bytes = [];
  let rest = value;
  do {
    let byte = rest & 0x7f;
    rest >>>= 7;
    if (rest > 0) byte |= 0x80;
    bytes.push(byte);
  } while (rest > 0);
  return Buffer.from(bytes);
}

function tag(field, wire) {
  return varint((field << 3) | wire);
}

function varintField(field, value) {
  return Buffer.concat([tag(field, 0), varint(value)]);
}

function stringField(field, text) {
  const body = Buffer.from(text, 'utf8');
  return Buffer.concat([tag(field, 2), varint(body.length), body]);
}

function message(field, body) {
  return Buffer.concat([tag(field, 2), varint(body.length), body]);
}

/** ItemList 한 행: { 1: id, 2: 이름 키, 3: 설명 키, 5: 장비 표시(관측) } */
function itemRow(id, nameKey, descKey, { equipFlag = false } = {}) {
  const parts = [varintField(1, id), stringField(2, nameKey)];
  if (descKey) parts.push(stringField(3, descKey));
  if (equipFlag) parts.push(varintField(5, 1));
  // 실제 데이터에는 뒤에 플래그가 더 붙는다. 모르는 필드를 지나치는지도 같이 본다.
  parts.push(varintField(4, 1), varintField(8, 51));
  return message(11, Buffer.concat(parts));
}

/** StringTable 한 행: { 1: 키, 2: 텍스트 } */
function stringRow(key, text) {
  return message(23, Buffer.concat([stringField(1, key), stringField(2, text)]));
}

/** 행 수 검사를 통과할 만큼의 덤불을 채워 넣는다. */
function buildResource({
  items = [],
  strings = [],
  equipTypes = [],
  upgradable = [],
  itemPadding = 30_000,
  stringPadding = 150_000,
} = {}) {
  const parts = [];

  // 장비 종류(필드 7)와 개조할 수 있는 아이템(필드 10). 같은 이름의 후보를 가를 때 쓴다.
  for (const [id, type] of equipTypes)
    parts.push(message(7, Buffer.concat([varintField(1, id), stringField(2, type)])));
  for (const id of upgradable) parts.push(message(10, varintField(1, id)));

  // 사이에 다른 데이터셋을 끼워 둔다. 최상위에서 필드 11, 23 만 골라 읽는지 보려는 것이다.
  parts.push(message(1, stringField(2, 'barter')), message(21, stringField(2, 'skill')));

  for (const row of strings) parts.push(stringRow(row[0], row[1]));
  for (let i = strings.length; i < stringPadding; i++)
    parts.push(stringRow(`pad.${i}`, `채움 ${i}`));

  for (const row of items) parts.push(itemRow(row[0], row[1], row[2], row[3]));
  for (let i = items.length; i < itemPadding; i++) parts.push(itemRow(900_000 + i, `pad.${i}`, ''));

  return brotliCompressSync(Buffer.concat(parts), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 1 },
  });
}

const SAMPLE = {
  items: [
    [5400133, 'itemdb.5178', 'itemdb.5181'],
    [17315, 'itemdb.43692', 'itemdb.43706'],
    [41300, 'itemdb.60097', ''],
    [99999, 'itemdb.없는키', 'itemdb.5181'],
  ],
  strings: [
    ['itemdb.5178', '초록빛 페어리 드래곤 의자'],
    ['itemdb.5181', '페어리 드래곤과 함께 휴식을 취할 수 있는 의자.'],
    ['itemdb.43692', '다우라의 부츠'],
    ['itemdb.43706', '다우라의 부츠. 다우라의 의상과 잘 어울릴 것 같다.'],
    ['itemdb.60097', '이름만 있는 아이템'],
  ],
};

describe('parseItemReference', () => {
  it('이름과 설명을 문자열 표를 거쳐 풀어 준다', () => {
    const { items } = parseItemReference(buildResource(SAMPLE));

    expect(items.get('초록빛 페어리 드래곤 의자')).toEqual({
      id: 5400133,
      description: '페어리 드래곤과 함께 휴식을 취할 수 있는 의자.',
    });
    expect(items.get('다우라의 부츠')).toEqual({
      id: 17315,
      description: '다우라의 부츠. 다우라의 의상과 잘 어울릴 것 같다.',
    });
  });

  it('설명 키가 없는 아이템은 설명을 빈 문자열로 둔다', () => {
    const { items } = parseItemReference(buildResource(SAMPLE));

    expect(items.get('이름만 있는 아이템')).toEqual({ id: 41300, description: '' });
  });

  it('이름이 안 풀리는 행은 버린다', () => {
    // 실제 데이터에도 문자열이 빠진 내부용 행이 있다. 이름 없이 카드를 만들 수는 없다.
    const { items } = parseItemReference(buildResource(SAMPLE));

    expect([...items.values()].some((item) => item.id === 99999)).toBe(false);
  });

  it('최상위의 다른 데이터셋에 휘둘리지 않는다', () => {
    const { itemRows, stringCount } = parseItemReference(buildResource(SAMPLE));

    expect(itemRows).toBe(30_000);
    expect(stringCount).toBe(150_000);
  });

  it('행 수가 확 줄면 형식이 바뀐 것으로 보고 멈춘다', () => {
    /**
     * 조용히 빈 결과를 돌려주면 사전을 통째로 비우는 일이 벌어진다. 필드 번호가 바뀌었을
     * 때는 소리를 내고 멈춰야 한다.
     */
    const thin = buildResource({ ...SAMPLE, itemPadding: 10, stringPadding: 10 });

    expect(() => parseItemReference(thin)).toThrow(/리소스 데이터의 모양이 달라졌습니다/);
  });

  it('같은 이름의 아이템을 후보로 모두 남기고, 고를 때 쓸 단서를 붙인다', () => {
    // 검 "간장" 과 음식 "간장" 은 이름이 같다. items 는 하나만 남기지만 candidates 에는 둘 다 있다.
    const { items, candidates } = parseItemReference(
      buildResource({
        strings: [
          ['itemdb.1', '간장'],
          ['itemdb.2', '아처가 애용하는 검'],
          ['itemdb_etc.3', '간장'],
          ['itemdb_etc.4', '짠맛이 나는 흑갈색 액체'],
          ['itemdb.5', '롱 소드'],
        ],
        items: [
          [41189, 'itemdb.1', 'itemdb.2', { equipFlag: true }],
          [50490, 'itemdb_etc.3', 'itemdb_etc.4'],
          [40001, 'itemdb.5', ''],
        ],
        equipTypes: [[40001, 'OHSword']],
        upgradable: [40001],
      }),
    );

    expect(items.get('간장')?.id).toBe(41189);
    expect(candidates.get('간장')).toEqual([
      {
        id: 41189,
        description: '아처가 애용하는 검',
        source: 'itemdb',
        equipType: '',
        equippable: true,
      },
      {
        id: 50490,
        description: '짠맛이 나는 흑갈색 액체',
        source: 'itemdb_etc',
        equipType: '',
        equippable: false,
      },
    ]);
    expect(candidates.get('롱 소드')).toEqual([
      { id: 40001, description: '', source: 'itemdb', equipType: 'OHSword', equippable: true },
    ]);
  });
});
