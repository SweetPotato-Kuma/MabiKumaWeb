/**
 * 능력치 이름표.
 *
 * 데이터에는 `attack_min` 같은 내부 이름으로 들어 있다. 화면 순서도 여기서 정한다.
 * `scale` 은 데이터가 비율로 들어 있는 것(0.05 → 5%)을 게임 표기로 바꾸는 배율이다.
 * 여기 없는 이름은 내부 이름 그대로 보여 준다. 틀린 이름을 붙이느니 원래 이름이 낫다.
 */
interface StatLabel {
  label: string;
  unit?: string;
  scale?: number;
}

const STAT_LABELS: [string, StatLabel][] = [
  ['attack_min', { label: '최소 공격력' }],
  ['attack_max', { label: '최대 공격력' }],
  ['magic_damage', { label: '마법 공격력' }],
  ['alchemy_damage', { label: '연금술 대미지' }],
  ['alchemy_all', { label: '4대 속성 연금술 대미지' }],
  ['alchemy_fire', { label: '불 속성 연금술 대미지' }],
  ['alchemy_water', { label: '물 속성 연금술 대미지' }],
  ['alchemy_wind', { label: '바람 속성 연금술 대미지' }],
  ['alchemy_earth', { label: '흙 속성 연금술 대미지' }],
  ['bonus_damage', { label: '보너스 대미지', unit: '%' }],
  ['critical_damage', { label: '크리티컬 대미지', unit: '%' }],
  ['wound_min', { label: '최소 부상률', unit: '%' }],
  ['wound_max', { label: '최대 부상률', unit: '%' }],
  ['critical', { label: '크리티컬', unit: '%' }],
  ['balance', { label: '밸런스', unit: '%' }],
  ['defense', { label: '방어' }],
  ['protect', { label: '보호' }],
  ['magic_defense', { label: '마법 방어' }],
  ['magic_protect', { label: '마법 보호' }],
  ['durability', { label: '내구력' }],
  ['lance_piercing', { label: '피어싱 레벨' }],
  ['smash_damage', { label: '스매시 대미지', unit: '%' }],
  ['attack_range', { label: '사정거리' }],
  ['splash_radius', { label: '범위 공격 거리' }],
  ['splash_damage', { label: '범위 공격 대미지', unit: '%', scale: 100 }],
  ['immune_melee', { label: '근접 공격 자동 방어', unit: '%', scale: 100 }],
  ['immune_ranged', { label: '원거리 공격 자동 방어', unit: '%', scale: 100 }],
  ['immune_magic', { label: '마법 공격 자동 방어', unit: '%', scale: 100 }],
  ['casting_speed', { label: '마법 시전 속도', unit: '%' }],
  ['manause_revised', { label: '마나 소모 감소', unit: '%' }],
  ['manaburn_revised', { label: '마나 증발 감소', unit: '%' }],
  ['max_bullet', { label: '장탄수' }],
  ['musicbuff_bonus', { label: '음악 버프 효과' }],
  ['musicbuff_duration', { label: '음악 버프 지속 시간' }],
  ['collecting_speed', { label: '채집 속도' }],
  ['collecting_bonus', { label: '채집 보너스' }],
  ['max_mana_increase', { label: '최대 마나' }],
  ['mana_recover', { label: '마나 회복' }],
  ['mana_reduce_percent', { label: '마나 소모 감소', unit: '%' }],
  // 인챈트의 "마나 소비 감소 2~6 증가". 게임 문장에 단위가 없어 붙이지 않는다.
  ['mana_saving', { label: '마나 소비 감소' }],
  ['attack_speed', { label: '공격 속도' }],
  ['explosion_resist', { label: '폭발 저항' }],
  ['stomp_resist', { label: '스톰프 저항' }],
  ['poison_immune', { label: '독 면역' }],
  ['marionette_attack_min', { label: '마리오네트 최소 대미지' }],
  ['marionette_attack_max', { label: '마리오네트 최대 대미지' }],
  ['marionette_critical', { label: '마리오네트 조종술 크리티컬', unit: '%' }],
  ['marionette_life', { label: '마리오네트 최대 생명력' }],
  ['marionette_defense', { label: '마리오네트 방어' }],
  ['marionette_protect', { label: '마리오네트 보호' }],
  ['marionette_magic_defense', { label: '마리오네트 마법 방어' }],
  ['astrologist_damage', { label: '점성술 대미지' }],
  ['music_buff_attack', { label: '전장의 서곡, 비바체 공격력 보너스', unit: '%' }],
  ['healing_potency', { label: '힐링 효과', unit: '%' }],
  ['life_max', { label: '최대 생명력' }],
  ['mana_max', { label: '최대 마나' }],
  ['stamina_max', { label: '최대 스태미나' }],
  ['str', { label: '체력' }],
  ['dex', { label: '솜씨' }],
  ['int', { label: '지력' }],
  ['will', { label: '의지' }],
  ['luck', { label: '행운' }],
];

const LABELS = new Map(STAT_LABELS);
const ORDER = new Map(STAT_LABELS.map(([stat], index) => [stat, index]));

/** 합산하지 않는 이름. 체인 캐스팅은 최소/최대 칸에 스킬 번호가 들어 있다. */
export const NON_ADDITIVE_STATS = new Set(['chain_casting']);

export function statLabel(stat: string): string {
  return LABELS.get(stat)?.label ?? stat;
}

/** 화면 순서. 이름표에 없는 것은 뒤로, 그 안에서는 이름순. */
export function compareStats(a: string, b: string): number {
  const ia = ORDER.get(a) ?? Number.MAX_SAFE_INTEGER;
  const ib = ORDER.get(b) ?? Number.MAX_SAFE_INTEGER;
  return ia - ib || a.localeCompare(b);
}

/** 소수 넷째 자리까지. f32 로 들어온 0.30000001 같은 값을 걷어 낸다. */
export function roundStat(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

/** 숫자만. 배율을 곱하고 자릿수를 맞춘다. 단위는 붙이지 않는다. */
function formatNumberPart(stat: string, value: number, signed: boolean): string {
  const scaled = roundStat(value * (LABELS.get(stat)?.scale ?? 1));
  const text = scaled.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  return `${signed && scaled > 0 ? '+' : ''}${text}`;
}

/** 값 하나를 게임 표기로. 단위와 배율을 붙인다. */
export function formatStatValue(stat: string, value: number, signed = false): string {
  return `${formatNumberPart(stat, value, signed)}${LABELS.get(stat)?.unit ?? ''}`;
}

/** 최소와 최대가 다르면 "3~5%" 로. 단위는 끝에 한 번만 붙인다. */
export function formatStatRange(stat: string, min: number, max: number, signed = false): string {
  if (min === max) return formatStatValue(stat, min, signed);
  // 더하는 폭이 0 부터면 "+0~10" 으로. "0~10" 이면 더하는 값인지 결과값인지 헷갈린다.
  const lead = signed && min === 0 ? '+' : '';
  const unit = LABELS.get(stat)?.unit ?? '';
  return `${lead}${formatNumberPart(stat, min, signed)}~${formatNumberPart(stat, max, false)}${unit}`;
}

/** 개조 한 줄의 효과를 사람이 읽는 글로. "최대 공격력 +14, 밸런스 -2" */
export function describeStats(stats: [string, number, number, number?][]): string {
  return stats
    .map(([stat, min, max, extra]) => {
      if (stat === 'chain_casting') return `체인 캐스팅 ${extra ?? 1}단계`;
      return `${statLabel(stat)} ${formatStatRange(stat, min, max, true)}`;
    })
    .join(', ');
}
