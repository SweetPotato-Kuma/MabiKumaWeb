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

const body = `${JSON.stringify({ updated, reforges, enchants: { prefix: prefixes, suffix: suffixes } })}\n`;
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, body);
console.log(
  `세공 ${reforges.length}개, 접두 인챈트 ${prefixes.length}개, 접미 인챈트 ${suffixes.length}개 -> ${OUT} (${Math.round(body.length / 1024)} KB)`,
);
