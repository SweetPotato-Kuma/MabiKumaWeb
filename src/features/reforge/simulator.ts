import { useCallback, useState } from 'react';
import type { PoolRow, ReforgeToolId } from './data';

/**
 * 세공 시뮬레이터.
 *
 * 세공 도구 가이드의 규칙 그대로 뽑는다.
 * - 옵션은 늘 세 줄이다. 줄마다 아직 안 나온 옵션 중 하나를 똑같은 확률로 고른다.
 * - 한계 돌파가 되는 옵션이면 도구별 확률로 한계 돌파 구간에 들어간다. 그 구간 안에서, 아니면
 *   일반 구간 안에서 레벨 하나를 똑같은 확률로 고른다.
 * 확률표에는 랭크를 고르는 칸이 있지만 세공은 늘 1랭크 세 줄로 붙는다.
 */

/** 한 번 세공하면 붙는 줄 수. */
export const REFORGE_LINES = 3;

/** "목표까지" 단추가 한 번에 세공하는 최대 횟수. 확률이 아주 낮은 목표에서 화면이 멈추지 않게. */
export const UNTIL_CAP = 10_000;

/** [0, 1) 난수. 테스트에서 바꿔 끼운다. */
export type RandomSource = () => number;

const pick = (length: number, random: RandomSource) =>
  Math.min(length - 1, Math.floor(random() * length));

export interface ReforgeLine {
  option: number;
  level: number;
  /** 한계 돌파 구간에서 나온 레벨인지. */
  limitBreak: boolean;
}

export interface ReforgeDraw {
  /** 몇 번째 세공인지. 1부터. 표의 키로도 쓴다. */
  no: number;
  tool: ReforgeToolId;
  /** 확률표의 아이템 타입 번호와 종족 번호. */
  type: number;
  race: number;
  /** 기억의 보석을 썼는지. 썼으면 보석값도 든다. */
  gem: boolean;
  lines: ReforgeLine[];
}

/** 세공 한 번의 세 줄. */
export function drawLines(
  pool: readonly PoolRow[],
  limitBreakRate: number,
  random: RandomSource = Math.random,
): ReforgeLine[] {
  const left = [...pool];
  const lines: ReforgeLine[] = [];
  while (lines.length < REFORGE_LINES && left.length > 0) {
    const [row] = left.splice(pick(left.length, random), 1);
    const [option, min, max, lbMin = 0, lbMax = 0] = row;
    const limitBreak = lbMax > 0 && random() < limitBreakRate;
    const [low, high] = limitBreak ? [lbMin, lbMax] : [min, max];
    lines.push({ option, level: low + pick(high - low + 1, random), limitBreak });
  }
  return lines;
}

/** 목표 한 줄. 이 옵션이 이 레벨 이상으로 붙기를 바란다. */
export interface ReforgeTarget {
  option: number;
  minLevel: number;
}

/** 세 줄이 목표를 모두 채우는지. 목표가 없으면 false 다. */
export function meetsTargets(lines: readonly ReforgeLine[], targets: readonly ReforgeTarget[]) {
  if (targets.length === 0) return false;
  return targets.every((target) =>
    lines.some((line) => line.option === target.option && line.level >= target.minLevel),
  );
}

/** 옵션이 붙었을 때 레벨이 minLevel 이상일 확률. */
export function levelAtLeast(row: PoolRow, minLevel: number, limitBreakRate: number): number {
  const [, min, max, lbMin = 0, lbMax = 0] = row;
  const share = (low: number, high: number) =>
    Math.max(0, high - Math.max(minLevel, low) + 1) / (high - low + 1);
  if (lbMax <= 0) return share(min, max);
  return (1 - limitBreakRate) * share(min, max) + limitBreakRate * share(lbMin, lbMax);
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i += 1) result = (result * (n - k + i)) / i;
  return result;
}

/**
 * 세공 한 번에 목표를 모두 채울 확률.
 *
 * 세 줄은 옵션 N개 중 셋을 겹치지 않게 고른 것이고 어느 셋이든 확률이 같다. 목표 옵션 k개가 모두
 * 들어갈 확률은 C(N-k, 3-k) / C(N, 3) 이다. 각 옵션의 레벨은 서로 따로 정해지니 곱한다.
 */
export function targetChance(
  pool: readonly PoolRow[],
  targets: readonly ReforgeTarget[],
  limitBreakRate: number,
): number {
  if (targets.length === 0) return 0;
  const lines = Math.min(REFORGE_LINES, pool.length);
  const picked =
    choose(pool.length - targets.length, lines - targets.length) / choose(pool.length, lines);
  let chance = picked;
  for (const target of targets) {
    const row = pool.find((entry) => entry[0] === target.option);
    if (!row) return 0;
    chance *= levelAtLeast(row, target.minLevel, limitBreakRate);
  }
  return chance;
}

export interface ReforgeSetting {
  tool: ReforgeToolId;
  type: number;
  race: number;
  pool: readonly PoolRow[];
  limitBreakRate: number;
}

/** 세공 창에 올려 둔 장비. 장비 종류나 종족을 바꾸면 새 장비다. */
export interface ReforgeItem {
  type: number;
  race: number;
  /** 장비에 붙어 있는 옵션. 기억의 보석을 쓰면 "기억된 옵션" 이다. 아직 세공하지 않았으면 null. */
  lines: ReforgeLine[] | null;
  /** 기억의 보석을 쓰고 나온 새 옵션. 적용하기 전까지 장비에 붙지 않는다. */
  pending: ReforgeLine[] | null;
}

export interface ReforgeSimulatorState {
  /** 지금까지 나온 것. 먼저 나온 것이 앞이다. */
  draws: ReforgeDraw[];
  /** 마지막으로 누른 단추가 몇 번 세공했는지. */
  lastBatch: number;
  item: ReforgeItem | null;
}

export interface ReforgeSimulator extends ReforgeSimulatorState {
  /** gem 이 참이면 기억의 보석을 쓴다. 옵션이 없는 장비에는 쓰지 못해 첫 세공은 보석 없이 한다. */
  draw: (setting: ReforgeSetting, times: number, gem: boolean) => void;
  /** 목표를 채울 때까지, 많아야 UNTIL_CAP 번 세공한다. */
  drawUntil: (setting: ReforgeSetting, targets: readonly ReforgeTarget[], gem: boolean) => void;
  /** 기억의 보석으로 나온 새 옵션을 장비에 붙인다. */
  applyPending: () => void;
  reset: () => void;
}

/** 그 설정의 장비인지. 아니면 세공 창에 새 장비를 올린 것으로 본다. */
export const isSameItem = (
  item: ReforgeItem | null,
  setting: Pick<ReforgeSetting, 'type' | 'race'>,
) => item !== null && item.type === setting.type && item.race === setting.race;

const EMPTY: ReforgeSimulatorState = { draws: [], lastBatch: 0, item: null };

/**
 * 한 번 이상 세공한 다음 상태. 기억의 보석을 쓰면 장비의 옵션은 그대로 두고 새 옵션만 pending 에
 * 둔다. 안 쓰면 새 옵션이 바로 장비에 붙는다. setState 갱신 함수 안에서 불러 순수하게 둔다.
 */
export function advance(
  prev: ReforgeSimulatorState,
  setting: ReforgeSetting,
  limit: number,
  gem: boolean,
  stop: (lines: ReforgeLine[]) => boolean,
  random: RandomSource,
): ReforgeSimulatorState {
  let item: ReforgeItem = isSameItem(prev.item, setting)
    ? (prev.item as ReforgeItem)
    : { type: setting.type, race: setting.race, lines: null, pending: null };
  const added: ReforgeDraw[] = [];
  while (added.length < limit) {
    const lines = drawLines(setting.pool, setting.limitBreakRate, random);
    const useGem = gem && item.lines !== null;
    added.push({
      no: prev.draws.length + added.length + 1,
      tool: setting.tool,
      type: setting.type,
      race: setting.race,
      gem: useGem,
      lines,
    });
    item = useGem ? { ...item, pending: lines } : { ...item, lines, pending: null };
    if (stop(lines)) break;
  }
  return { draws: [...prev.draws, ...added], lastBatch: added.length, item };
}

/**
 * 세공 기록과 세공 창의 장비. 새로 고치거나 화면을 떠나면 처음부터다. 놀이 기록이라 브라우저에
 * 남기지 않는다.
 */
export function useReforgeSimulator(random?: RandomSource): ReforgeSimulator {
  const [state, setState] = useState<ReforgeSimulatorState>(EMPTY);

  const run = useCallback(
    (
      setting: ReforgeSetting,
      limit: number,
      gem: boolean,
      stop: (lines: ReforgeLine[]) => boolean,
    ) =>
      // 난수는 뽑을 때 찾는다. 처음 그릴 때의 Math.random 을 붙잡아 두지 않는다.
      setState((prev) => advance(prev, setting, limit, gem, stop, random ?? Math.random)),
    [random],
  );

  const draw = useCallback(
    (setting: ReforgeSetting, times: number, gem: boolean) => run(setting, times, gem, () => false),
    [run],
  );
  const drawUntil = useCallback(
    (setting: ReforgeSetting, targets: readonly ReforgeTarget[], gem: boolean) =>
      run(setting, UNTIL_CAP, gem, (lines) => meetsTargets(lines, targets)),
    [run],
  );
  const applyPending = useCallback(
    () =>
      setState((prev) =>
        prev.item?.pending
          ? { ...prev, item: { ...prev.item, lines: prev.item.pending, pending: null } }
          : prev,
      ),
    [],
  );
  const reset = useCallback(() => setState(EMPTY), []);
  return { ...state, draw, drawUntil, applyPending, reset };
}

/**
 * 옵션 문장을 이름과 레벨별 효과로 나눈다. 확률표의 문장은 세 가지 모양이다.
 *   "대미지밸런스(1레벨 당 1 % 증가)"                                   레벨 x 1
 *   "힐링 수련 경험치(1레벨 1.10 배 ... 증가/이후 1레벨 당 0.10 배 ... 증가)"  1.10 + 0.10 x (레벨 - 1)
 *   "캐스팅 속도(1레벨 당 1.50 % 증가/원드에는 2회 적용)"                  빗금 뒤는 덧붙임
 * 괄호가 없는 옵션("돌진 인간 및 엘프일 때 방패 없이 사용 가능")은 레벨로 효과가 달라지지 않는다.
 */
export interface ParsedOption {
  name: string;
  /** 1레벨의 값. 문장에서 읽지 못하면 null. */
  base: number | null;
  /** 레벨이 하나 오를 때마다 더하는 값. */
  per: number;
  /** 값 뒤에 붙는 말. "% 증가", "배 수련 경험치 증가" */
  suffix: string;
  /** 빗금 뒤에 덧붙은 말. "원드에는 2회 적용". 없으면 빈 문자열. */
  note: string;
}

/**
 * 이름과 끝의 괄호 묶음. 이름 안에도 괄호가 있고("랜스 차지 범위 폭(인간)") 효과 안에도 한 겹 더
 * 있어서("5 증가(초당)") 마지막 괄호 묶음을 한 겹까지 품어 읽는다.
 */
const OPTION_PATTERN = /^(.*)\(((?:[^()]|\([^()]*\))*)\)$/;
const PER_LEVEL = /^1\s*레벨\s*당\s*([\d.]+)\s*(.*)$/;
const FIRST_LEVEL = /^1\s*레벨\s+([\d.]+)\s*(.*)$/;
const AFTER_LEVEL = /^이후\s*1\s*레벨\s*당\s*([\d.]+)/;

export function parseOption(text: string): ParsedOption {
  const plain: ParsedOption = { name: text.trim(), base: null, per: 0, suffix: '', note: '' };
  const match = OPTION_PATTERN.exec(text.trim());
  if (!match) return plain;
  const [head, ...rest] = match[2].split('/').map((part) => part.trim());

  const perLevel = PER_LEVEL.exec(head);
  if (perLevel) {
    const per = Number(perLevel[1]);
    return { name: match[1].trim(), base: per, per, suffix: perLevel[2], note: rest.join('/') };
  }
  const first = FIRST_LEVEL.exec(head);
  const after = rest[0] ? AFTER_LEVEL.exec(rest[0]) : null;
  if (first && after) {
    return {
      name: match[1].trim(),
      base: Number(first[1]),
      per: Number(after[1]),
      suffix: first[2],
      note: rest.slice(1).join('/'),
    };
  }
  return plain;
}

/** 값에 바로 붙는 단위. "5%", "3초", "40cm". 나머지는 띄어 쓴다("15 증가"). */
const ATTACHED_UNIT = /^(%|cm|m|초|도|배|개|마리|명)(\s|$)/;

/** "7% 증가". 레벨로 효과가 달라지지 않는 옵션은 null. */
export function optionEffect(option: ParsedOption, level: number): string | null {
  if (option.base === null) return null;
  // 레벨당 값이 소수일 때 곱셈 오차가 끝자리에 남지 않게 한다.
  const value = Math.round((option.base + option.per * (level - 1)) * 10_000) / 10_000;
  const number = value.toLocaleString('ko-KR', { maximumFractionDigits: 4 });
  const suffix = !option.suffix
    ? ''
    : ATTACHED_UNIT.test(option.suffix)
      ? option.suffix
      : ` ${option.suffix}`;
  return `${number}${suffix}${option.note ? ` (${option.note})` : ''}`;
}
