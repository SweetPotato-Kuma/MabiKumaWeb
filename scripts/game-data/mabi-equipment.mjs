import { brotliDecompressSync } from 'node:zlib';

/**
 * 리소스 덩어리에서 장비 시뮬레이터에 쓸 데이터셋을 푼다.
 *
 * `mabi-resource.mjs` 는 이름과 설명만 보면 되니 필드 번호 두 개로 끝났다. 여기서는
 * 데이터셋 여덟 개를 중첩 메시지까지 풀어야 해서 작은 스키마를 둔다. 필드 번호는 그
 * 덩어리를 쓰는 웹 번들에 들어 있는 protobuf 기술자에서 옮겨 왔다(2026-09).
 *
 * 스키마 표기: [필드번호]: [이름, 종류, 반복여부]
 *   종류가 문자열이면 스칼라('u32' 'i32' 'str' 'bool' 'f32'), 객체면 하위 메시지다.
 */

const S = {
  UpgradeGem: { 1: ['Name', 'str'], 2: ['Size', 'f32'] },
  ModifyStat: { 1: ['Name', 'str'], 2: ['Min', 'f32'], 3: ['Max', 'f32'], 4: ['Extra', 'i32'] },
  LuckyCount: { 1: ['Count', 'u32'], 2: ['Rate', 'u32'] },
  LuckyOption: { 1: ['Id', 'u32'], 2: ['Rate', 'u32'] },
  RandomElement: { 1: ['Name', 'str'], 2: ['Min', 'u32'], 3: ['Max', 'u32'] },
  SetElement: { 1: ['Name', 'str'], 2: ['Min', 'u32'], 3: ['Max', 'u32'] },
};
S.Lucky = {
  1: ['Id', 'u32'],
  2: ['CountTotalRate', 'u32'],
  3: ['CountRates', S.LuckyCount, true],
  4: ['RandomOptionTotalRate', 'u32'],
  5: ['RandomOptionRates', S.LuckyOption, true],
  6: ['FixedOptions', 'u32', true],
};

const DATASETS = {
  7: [
    'ItemExtendMetalWareList',
    {
      1: ['Id', 'u32'],
      2: ['EquipType', 'str'],
      3: ['Human', 'bool'],
      4: ['Elf', 'bool'],
      5: ['Giant', 'bool'],
    },
  ],
  8: ['ItemExtendRandomProductList', { 1: ['Id', 'u32'], 2: ['Elements', S.RandomElement, true] }],
  // 아이템 번호별 세트 효과 수치. QualityElements 는 품질이 그 값 이상일 때 더 붙는 수치다.
  9: [
    'ItemExtendSetItemDescList',
    {
      1: ['Id', 'u32'],
      2: ['Elements', S.SetElement, true],
      3: ['QualityElements', { 1: ['Quality', 'u32'], 2: ['Elements', S.SetElement, true] }, true],
    },
  ],
  10: [
    'ItemExtendUpgradeList',
    {
      1: ['Id', 'u32'],
      2: ['UpgradeMax', 'u32'],
      3: ['GemUpgradeMax', 'u32'],
      4: ['UpgradeIds', 'u32', true],
    },
  ],
  11: ['ItemList', { 1: ['Id', 'u32'], 2: ['Name', 'str'], 3: ['Desc', 'str'] }],
  12: [
    'ItemUpgradeList',
    {
      1: ['Id', 'u32'],
      2: ['Name', 'str'],
      3: ['Desc', 'str'],
      4: ['NeedEp', 'u32'],
      5: ['NeedGold', 'u32'],
      6: ['NeedGems', S.UpgradeGem, true],
      7: ['UpgradedMin', 'u32'],
      8: ['UpgradedMax', 'u32'],
      9: ['AvailableNpcs', 'str', true],
      10: ['ModifyStats', S.ModifyStat, true],
      11: ['OptionSetIds', 'u32', true],
      12: ['LuckyUpgrade', S.Lucky],
      13: ['Personalize', 'bool'],
    },
  ],
  13: [
    'MetalWareAbilityList',
    {
      1: ['Id', 'u32'],
      2: ['Desc', 'str'],
      3: ['BaseMaxLevel', 'u32'],
      4: ['BaseMaxLevelAcc', 'u32'],
      5: ['BaseMaxLevelOH', 'u32'],
      6: ['SubDesc', 'str'],
      7: ['InitialValue', 'f32'],
      8: ['ValuePerLevel', 'f32'],
      9: ['LimitBreak', 'bool'],
      10: ['Standard', 'f32'],
      // 11: EquipFilterMap(map<string,bool>), 12: TypeFilterMap(map<uint32,bool>). 아래에서 따로 푼다.
      13: ['Human', 'bool'],
      14: ['Elf', 'bool'],
      15: ['Giant', 'bool'],
    },
  ],
  15: [
    'MetalWareLevelList',
    {
      1: ['Level', 'u32'],
      2: ['Rank3MinLevel', 'u32'],
      3: ['Rank3MaxLevel', 'u32'],
      4: ['Rank2MinLevel', 'u32'],
      5: ['Rank2MaxLevel', 'u32'],
      6: ['Rank1MinLevel', 'u32'],
      7: ['Rank1MaxLevel', 'u32'],
      8: ['LimitBreakMinLevel', 'u32'],
      9: ['LimitBreakMaxLevel', 'u32'],
    },
  ],
  17: [
    'OptionSetList',
    {
      1: ['Id', 'u32'],
      2: ['Name', 'str'],
      3: ['Name2', 'str'],
      4: ['Desc', 'str'],
      5: ['Usage', 'u32'],
      6: ['Level', 'u32'],
    },
  ],
  // 세트 효과 정의. 장착한 장비들의 수치 합이 ThresholdCount 이상이면 효과가 켜진다.
  20: [
    'SetItemDescElementList',
    {
      1: ['Id', 'u32'],
      2: ['Key', 'str'],
      3: ['Name', 'str'],
      4: ['Desc', 'str'],
      5: ['ThresholdCount', 'i32'],
      6: ['ThresholdConditionId', 'u32'],
    },
  ],
  // 개조 NPC 의 한글 이름. NPC 도 종족 한 줄로 들어 있고 ClassName 이 내부 이름이다.
  19: ['RaceList', { 1: ['Id', 'u32'], 2: ['Name', 'str'], 3: ['ClassName', 'str'] }],
  23: ['StringTable', { 1: ['Id', 'str'], 2: ['Str', 'str'] }],
  // 던전과 미션 보상. 인챈트가 어느 던전에서 나오는지(인챈트 정렬의 첫 기준)를 여기서 안다.
  93: [
    'ContentsRewardList',
    {
      3: ['Name', 'str'],
      4: ['GroupId', 'u32'],
      5: ['Difficulties', { 3: ['DifficultyName', 'str'], 5: ['PoolIds', 'u32', true] }, true],
    },
  ],
  94: [
    'ContentsRewardPoolList',
    {
      1: ['Id', 'u32'],
      2: [
        'Rewards',
        {
          1: ['Type', 'str'],
          2: ['RewardId', 'u32'],
          7: ['PrefixOptionSetId', 'u32'],
          8: ['SuffixOptionSetId', 'u32'],
        },
        true,
      ],
    },
  ],
  95: ['ContentsRewardGroupList', { 1: ['Id', 'u32'], 2: ['Name', 'str'] }],
  // 에르그. 등급(B, A, S 와 어둠의 에르그)마다 레벨표와, 무기 묶음별 효과 문장 틀과 레벨별 값이 있다.
  // 문장 틀의 {0} {1} 을 그 레벨의 값으로 채운다. 아이템 → 무기 묶음은 ErgItemList 가 잇는다.
  101: [
    'ErgTypeList',
    {
      1: ['TypeId', 'u32'],
      2: ['Name', 'str'],
      3: [
        'Levels',
        {
          1: ['ErgLevel', 'u32'],
          2: ['ExpValue', 'u32'],
          3: ['NeedGold', 'u32'],
          4: ['Effect', 'str'],
        },
        true,
      ],
      4: [
        'WeaponSets',
        {
          1: ['WeaponSetId', 'u32'],
          2: ['EffectTemplates', 'str', true],
          3: ['UIUnit', 'str'],
          4: [
            'Ablities',
            {
              1: ['ErgLevel', 'u32'],
              2: ['Values', 'f32', true],
              3: ['DisplayValues', 'f32', true],
            },
            true,
          ],
        },
        true,
      ],
      5: [
        'MaxLevels',
        {
          1: ['ErgMaxLevelId', 'u32'],
          2: ['ErgLevel', 'u32'],
          3: ['Probability', 'u32'],
          4: ['AddProbability', 'u32'],
          5: ['MaxAddProbability', 'u32'],
        },
        true,
      ],
      6: ['UnlockErgTypeId', 'u32'],
    },
  ],
  102: ['ErgItemList', { 1: ['Id', 'u32'], 2: ['WeaponSetId', 'u32'] }],
};

/** 2026-09 관측값의 하한. 필드 번호가 바뀌면 행 수가 먼저 무너진다. */
const MIN_ROWS = {
  ItemList: 30_000,
  StringTable: 150_000,
  ItemUpgradeList: 2_000,
  OptionSetList: 1_000,
  RaceList: 5_000,
  ItemExtendUpgradeList: 2_000,
  ItemExtendMetalWareList: 5_000,
  MetalWareAbilityList: 300,
  MetalWareLevelList: 10,
  ItemExtendSetItemDescList: 500,
  SetItemDescElementList: 100,
};

function readVarint(buffer, position) {
  let result = 0n;
  let shift = 0n;
  let byte;
  do {
    byte = buffer[position++];
    result |= BigInt(byte & 0x7f) << shift;
    shift += 7n;
  } while (byte & 0x80);
  return [result, position];
}

function readScalar(kind, wire, buffer, position) {
  if (wire === 0) {
    const [value, next] = readVarint(buffer, position);
    if (kind === 'bool') return [value !== 0n, next];
    if (kind === 'i32') return [Number(BigInt.asIntN(32, value)), next];
    return [Number(value), next];
  }
  if (wire === 5) {
    const value = kind === 'f32' ? buffer.readFloatLE(position) : buffer.readUInt32LE(position);
    return [value, position + 4];
  }
  if (wire === 1) return [Number(buffer.readBigUInt64LE(position)), position + 8];
  throw new Error(`알 수 없는 wire type ${wire}`);
}

/** map<string, bool> 한 칸. { 1: key, 2: value } 모양의 메시지다. */
function readMapEntry(buffer) {
  let position = 0;
  let key;
  let value = false;
  while (position < buffer.length) {
    let tag;
    [tag, position] = readVarint(buffer, position);
    const field = Number(tag >> 3n);
    const wire = Number(tag & 7n);
    if (wire === 2) {
      let length;
      [length, position] = readVarint(buffer, position);
      key = buffer.subarray(position, position + Number(length)).toString('utf8');
      position += Number(length);
    } else {
      let raw;
      [raw, position] = readVarint(buffer, position);
      if (field === 1) key = Number(raw);
      else value = raw !== 0n;
    }
  }
  return [key, value];
}

function decode(schema, buffer) {
  const out = {};
  let position = 0;

  while (position < buffer.length) {
    let tag;
    [tag, position] = readVarint(buffer, position);
    const field = Number(tag >> 3n);
    const wire = Number(tag & 7n);
    const spec = schema[field];

    if (wire === 2) {
      let length;
      [length, position] = readVarint(buffer, position);
      const slice = buffer.subarray(position, position + Number(length));
      position += Number(length);

      if (!spec) {
        // 세공 옵션의 장비 필터는 map 이라 스키마 밖에서 푼다.
        if (schema === DATASETS[13][1] && (field === 11 || field === 12)) {
          const name = field === 11 ? 'EquipFilterMap' : 'TypeFilterMap';
          const [key, value] = readMapEntry(slice);
          (out[name] ??= {})[key] = value;
        }
        continue;
      }

      const [name, kind, repeated] = spec;
      if (typeof kind === 'object') {
        const value = decode(kind, slice);
        if (repeated) (out[name] ??= []).push(value);
        else out[name] = value;
      } else if (kind === 'str') {
        const value = slice.toString('utf8');
        if (repeated) (out[name] ??= []).push(value);
        else out[name] = value;
      } else {
        // 반복 숫자 필드는 packed 로 온다.
        const values = [];
        let inner = 0;
        const innerWire = kind === 'f32' ? 5 : 0;
        while (inner < slice.length) {
          let value;
          [value, inner] = readScalar(kind, innerWire, slice, inner);
          values.push(value);
        }
        out[name] = (out[name] ?? []).concat(values);
      }
      continue;
    }

    let value;
    [value, position] = readScalar(spec?.[1], wire, buffer, position);
    if (!spec) continue;
    const [name, , repeated] = spec;
    if (repeated) (out[name] ??= []).push(value);
    else out[name] = value;
  }

  return out;
}

/** 눌린 덩어리에서 필요한 데이터셋만 풀어 이름별 배열로 돌려준다. */
export function parseEquipmentResource(compressed) {
  const raw = brotliDecompressSync(compressed);
  const out = Object.fromEntries(Object.values(DATASETS).map(([name]) => [name, []]));

  let position = 0;
  while (position < raw.length) {
    let tag;
    [tag, position] = readVarint(raw, position);
    const field = Number(tag >> 3n);
    const wire = Number(tag & 7n);
    if (wire !== 2) {
      [, position] = readScalar(undefined, wire, raw, position);
      continue;
    }
    let length;
    [length, position] = readVarint(raw, position);
    const slice = raw.subarray(position, position + Number(length));
    position += Number(length);

    const dataset = DATASETS[field];
    if (dataset) out[dataset[0]].push(decode(dataset[1], slice));
  }

  const short = Object.entries(MIN_ROWS).filter(([name, min]) => out[name].length < min);
  if (short.length > 0) {
    throw new Error(
      `리소스 데이터의 모양이 달라졌습니다. ${short.map(([name]) => `${name} ${out[name].length}행`).join(', ')}. ` +
        '필드 번호가 바뀌었는지 확인하세요.',
    );
  }

  return out;
}
