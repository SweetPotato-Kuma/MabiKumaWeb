/**
 * 경매장 상세 검색의 자동완성 이름 모으기
 *
 * 상세 검색의 자동완성은 불러온 매물에 있는 이름을 쓴다. 그런데 매물을 불러오기 전에는 비어
 * 있어서, 세공 칸을 눌러도 아무것도 나오지 않았다. 게임 데이터에서 세공 능력 이름과 인챈트 이름을
 * 뽑아 두고 매물이 없을 때도 이것으로 자동완성한다.
 *
 * 뽑는 것:
 * - 세공 능력 이름(MetalWareAbilityList). 경매장 세공 옵션의 "(N레벨:...)" 앞부분과 같은 글이다
 * - 인챈트 이름(OptionSetList). 접두와 접미를 나눈다. Usage 가 1 이면 접미, 없으면 접두다
 *   (경매장 매물에 붙은 "울프헌터"(접두), "블러드"(접미) 로 확인)
 * - 세공 능력마다 레벨 상한 기준값(기본, 한손 무기, 장신구)과 한계 돌파 여부, 그리고 기준값별
 *   1랭크 최대 레벨과 한계 돌파 레벨(MetalWareLevelList). 레벨 자동완성이 그 세공에서 나올 수
 *   없는 레벨을 권하지 않게 한다. 장비 시뮬레이터(features/equipment/reforge.ts)와 같은 규칙이다
 *
 * 실행: node scripts/build-option-names.mjs
 * 산출: public/data/option-names.json
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadResourceData, stringLookup } from './lib/resource-data.mjs';

const OUT = resolve('public/data/option-names.json');
const SUFFIX_USAGE = 1;

/**
 * 이름 목록. 게임 데이터에는 "1", "3" 처럼 숫자만 있는 시험용 이름이 섞여 있어 뺀다.
 */
const isRealName = (name) => Boolean(name) && !/^[\d\s]+$/.test(name);
const sortKo = (names) =>
  [...new Set(names.filter(isRealName))].sort((a, b) => a.localeCompare(b, 'ko'));

const { data, updated } = await loadResourceData();
const text = stringLookup(data);

const reforges = sortKo(data.MetalWareAbilityList.map((ability) => text(ability.Desc)));
const prefixes = sortKo(
  data.OptionSetList.filter((set) => set.Usage !== SUFFIX_USAGE).map((set) => text(set.Name)),
);
const suffixes = sortKo(
  data.OptionSetList.filter((set) => set.Usage === SUFFIX_USAGE).map((set) => text(set.Name)),
);

/**
 * 세공 이름 -> [기본, 한손 무기, 장신구 상한 기준값, 한계 돌파면 1]. 이름이 같은 능력이 여럿이면
 * 칸마다 큰 값을 쓴다. 한손 무기와 장신구 값이 없으면 기본값과 같다.
 */
const reforgeCaps = {};
for (const ability of data.MetalWareAbilityList) {
  const name = text(ability.Desc);
  if (!isRealName(name)) continue;
  const base = ability.BaseMaxLevel ?? 0;
  const next = [
    base,
    ability.BaseMaxLevelOH || base,
    ability.BaseMaxLevelAcc || base,
    ability.LimitBreak ? 1 : 0,
  ];
  const prev = reforgeCaps[name];
  reforgeCaps[name] = prev ? prev.map((value, index) => Math.max(value, next[index])) : next;
}

/** 상한 기준값 -> [1랭크 최대 레벨, 한계 돌파 최소, 한계 돌파 최대]. */
const reforgeLevels = Object.fromEntries(
  data.MetalWareLevelList.map((row) => [
    row.Level,
    [row.Rank1MaxLevel ?? 0, row.LimitBreakMinLevel ?? 0, row.LimitBreakMaxLevel ?? 0],
  ]),
);

const body = `${JSON.stringify({
  updated,
  reforges,
  reforgeCaps,
  reforgeLevels,
  enchants: { prefix: prefixes, suffix: suffixes },
})}\n`;
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, body);
console.log(
  `세공 ${reforges.length}개, 접두 인챈트 ${prefixes.length}개, 접미 인챈트 ${suffixes.length}개 -> ${OUT} (${Math.round(body.length / 1024)} KB)`,
);
