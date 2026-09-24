import { formatStatValue, statLabel } from './stats';

/**
 * 특별 개조 단계별 효과.
 *
 * 게임 데이터에는 장비가 받는 특별 개조 종류 번호(S 201, R 303 같은)와 단계 상한만 있고 단계별
 * 수치가 없다. 여기 표는 공개된 커뮤니티 자료의 표를 옮긴 것이다. 그 자료 스스로 오래된 문서라고
 * 밝히고 있고 빈칸도 있다. 빈칸은 null 로 두고 화면에 "수치 미확인" 으로 적는다. 짐작해 채우지 않는다.
 *
 * 종류 번호와 무기 종류의 짝은 수집한 장비를 번호별로 묶어 확인했다(2026-09).
 *   S201 R301  한손 무기(검, 둔기)          S202 R302  한손 도끼
 *   S203 R303  양손 무기, 활, 석궁, 랜스    S204 R303  원드, 스태프, 마법 낫
 *   S210 R303  실린더                       S211 R305  악기
 *   S212 R306  힐링 원드
 */

/** 한 단계의 효과. [능력치, 값] 목록. null 이면 그 단계 수치를 모른다. */
export type SpecialStep = [stat: string, value: number][] | null;

type StepTable = SpecialStep[];

const s = (min: number, max: number, bonus: number): SpecialStep => [
  ['attack_min', min],
  ['attack_max', max],
  ['bonus_damage', bonus],
];

const magic = (value: number, bonus: number): SpecialStep => [
  ['magic_damage', value],
  ['bonus_damage', bonus],
];

/** 실린더는 연금술 대미지가 1~5단계 빈칸이다. 보너스 대미지만 확실하다. */
const alchemy = (value: number | null, bonus: number): SpecialStep =>
  value === null
    ? [['bonus_damage', bonus]]
    : [
        ['alchemy_damage', value],
        ['bonus_damage', bonus],
      ];

const one =
  (stat: string) =>
  (value: number): SpecialStep => [[stat, value]];
const crit = one('critical_damage');

/** S 종류. 배열 첫 칸이 1단계다. */
const S_TABLE: Record<number, StepTable> = {
  201: [
    s(30, 60, 2),
    s(35, 70, 2),
    s(40, 80, 3),
    s(45, 90, 3),
    s(50, 100, 4),
    s(55, 110, 4),
    s(60, 120, 5),
    null,
  ],
  202: [
    s(40, 80, 2),
    s(45, 90, 2),
    s(50, 100, 3),
    s(55, 110, 3),
    s(60, 120, 4),
    s(65, 130, 5),
    s(70, 140, 6),
    null,
  ],
  203: [
    s(25, 50, 2),
    s(30, 60, 3),
    s(35, 70, 4),
    s(45, 90, 5),
    s(55, 110, 6),
    s(65, 130, 7),
    s(78, 155, 9),
    null,
  ],
  204: [
    magic(90, 2),
    magic(105, 3),
    magic(125, 4),
    magic(155, 5),
    magic(190, 6),
    magic(230, 7),
    magic(270, 9),
    magic(310, 10),
  ],
  210: [
    alchemy(null, 2),
    alchemy(null, 3),
    alchemy(null, 4),
    alchemy(null, 5),
    alchemy(null, 6),
    alchemy(26, 7),
    alchemy(33, 9),
    null,
  ],
};

/** R 종류. */
const R_TABLE: Record<number, StepTable> = {
  301: [4, 11, 18, 26, 34, 42, 50].map(crit).concat([null]),
  302: [5, 14, 23, 33, 43, 53, 63, 89].map(crit),
  303: [6, 16, 26, 38, 50, 62, 74, 89].map(crit),
  305: [0.5, 1, 1.5, 2.3, 3, 3.8, 4.5, 5.5].map(one('music_buff_attack')),
  306: [2, 3, 5, 7, 10, 13, 16, 20].map(one('healing_potency')),
};

/**
 * 이 종류 번호, 이 단계의 효과.
 * - 배열: 알고 있는 효과
 * - null: 표에 그 단계 칸이 비어 있다(수치 미확인)
 * - undefined: 그 종류 번호 표가 아예 없다
 */
export function specialStep(kind: 's' | 'r', type: number, level: number): SpecialStep | undefined {
  const table = (kind === 's' ? S_TABLE : R_TABLE)[type];
  if (!table || level < 1) return undefined;
  return table[level - 1] ?? null;
}

/** 한 단계의 효과를 한 줄로. 모르는 칸이면 그렇다고 적는다. */
export function describeSpecialStep(step: SpecialStep | undefined): string {
  if (step === undefined) return '이 종류의 단계별 수치는 모았던 표에 없습니다.';
  if (step === null) return '이 단계의 수치는 아직 확인되지 않았습니다.';
  return step
    .map(([stat, value]) => `${statLabel(stat)} ${formatStatValue(stat, value, true)}`)
    .join(', ');
}
