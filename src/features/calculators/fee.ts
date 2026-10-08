import type { CalcResult, CalculatorDef, Cell, Field, Values } from './schema';

/**
 * 경매장 수수료 계산기.
 *
 * 판매 수수료는 판매가의 5%(프리미엄 라이프나 콤비네이션 멤버십은 4%)이고, 판매 대금을 받을 때 수수료 할인 쿠폰
 * (10, 20, 30, 50, 100%) 하나를 골라 그 수수료를 그만큼 덜 낼 수 있다. 쿠폰은 돈을 주고 사야 하므로 쿠폰 값이 할인액보다
 * 비싸면 안 쓰는 편이 낫다. 판매가에 따라 어느 쿠폰이 가장 남는지를 가려 준다.
 *
 * 공식 안내에 수수료와 할인액의 반올림 규칙은 없다. 소수점 이하는 버리는 것으로 계산한다.
 */

export const FEE_RATE = 0.05;
export const PREMIUM_FEE_RATE = 0.04;

/** 쿠폰 할인율(%). */
export const COUPON_PERCENTS = [10, 20, 30, 50, 100] as const;

/** 경매장에 오른 쿠폰의 이름. 시세도 이 이름으로 묻는다. */
export const couponName = (percent: number) => `경매장 수수료 ${percent}% 할인 쿠폰`;

const couponKey = (percent: number) => `c${percent}`;

/** 고를 수 있는 선택지 하나. 쿠폰을 안 쓰는 것도 하나다. */
export interface FeeOption {
  id: string;
  label: string;
  /** 0~1. */
  discount: number;
  /** 쿠폰 값. 모르면 null 이라 줄 세우기에서 뺀다. */
  cost: number | null;
}

export interface FeeOutcome extends FeeOption {
  fee: number;
  /** 쿠폰으로 덜 낸 수수료. */
  saved: number;
  /** 손에 남는 골드. 쿠폰 값과 기타 비용을 이미 뺐다. 쿠폰 값을 모르면 null. */
  net: number | null;
}

/** 쿠폰 없이 수수료를 내는 선택지. */
const NO_COUPON: FeeOption = { id: 'none', label: '쿠폰 없음', discount: 0, cost: 0 };

export function feeOutcome(price: number, rate: number, other: number, option: FeeOption): FeeOutcome {
  const fee = Math.floor(price * rate);
  const saved = Math.floor(fee * option.discount);
  const net = option.cost === null ? null : price - fee + saved - option.cost - other;
  return { ...option, fee, saved, net };
}

/** 가장 많이 남는 선택지. 값이 같으면 앞의 것(할인이 작은 쪽)이 이긴다. 고를 수 있는 것이 없으면 undefined. */
export function bestOutcome(outcomes: readonly FeeOutcome[]): FeeOutcome | undefined {
  let best: FeeOutcome | undefined;
  for (const outcome of outcomes) {
    if (outcome.net === null) continue;
    if (best === undefined || (best.net ?? -Infinity) < outcome.net) best = outcome;
  }
  return best;
}

/** 나누기로 구한 경계가 2천만 바로 아래(19,999,999.9999)로 나와 한 칸 모자라게 잘리지 않게 두는 여유. */
const EDGE_SLACK = 1e-6;

export interface FeeRange {
  id: string;
  /** 이 판매가부터 이 선택지가 가장 유리하다. */
  from: number;
  /** 이 판매가까지. null 이면 그 위로 끝없이. */
  to: number | null;
}

/**
 * 판매가 구간마다 가장 유리한 선택지. 남는 돈은 판매가의 일차식(판매가 x (1 - 수수료율 x (1 - 할인율)) - 쿠폰 값)이라
 * 선택지끼리 만나는 판매가에서만 순위가 바뀐다. 그 만나는 곳을 경계로 잘라 구간마다 가장 큰 것을 고른다.
 * 소수점 이하를 버리기 전의 식으로 센 경계라 실제와 1골드쯤 어긋날 수 있다.
 */
export function bestRanges(options: readonly FeeOption[], rate: number): FeeRange[] {
  const known = options.filter((option): option is FeeOption & { cost: number } => option.cost !== null);
  if (known.length === 0) return [];
  const slope = (option: FeeOption) => 1 - rate * (1 - option.discount);
  const value = (option: FeeOption & { cost: number }, price: number) => slope(option) * price - option.cost;

  // 두 선택지가 만나는 판매가. 기울기가 같으면(할인율이 같으면) 만나지 않는다.
  const cuts = new Set<number>();
  for (const a of known)
    for (const b of known) {
      const gap = slope(a) - slope(b);
      if (gap === 0) continue;
      const cut = (a.cost - b.cost) / gap;
      if (cut > 0 && Number.isFinite(cut)) cuts.add(cut);
    }
  const edges = [0, ...[...cuts].sort((x, y) => x - y)];

  const ranges: FeeRange[] = [];
  edges.forEach((from, index) => {
    const to = edges[index + 1] ?? null;
    const probe = to === null ? from + Math.max(1, from) : (from + to) / 2;
    let best = known[0];
    for (const option of known) if (value(option, probe) > value(best, probe)) best = option;
    const last = ranges[ranges.length - 1];
    if (last && last.id === best.id) last.to = to;
    else ranges.push({ id: best.id, from: Math.max(0, Math.ceil(from - EDGE_SLACK)), to: to === null ? null : Math.floor(to + EDGE_SLACK) });
  });
  return ranges;
}

const fields: readonly Field[] = [
  {
    type: 'gold',
    key: 'price',
    label: '판매가',
    default: 100_000_000,
    quick: [100_000_000, 50_000_000, 10_000_000, 1_000_000],
  },
  // 멤버십 여부와 직접 넣은 쿠폰 값은 내 설정이다. 메뉴로 다시 들어와도 매번 새로 넣지 않게 기억한다.
  { type: 'toggle', key: 'premium', label: '프리미엄 라이프, 콤비네이션 멤버십 (수수료 4%)', default: false, remember: true },
  ...COUPON_PERCENTS.map(
    (percent): Field => ({
      type: 'gold',
      key: couponKey(percent),
      label: `${percent}% 쿠폰 값`,
      default: null,
      autoFill: couponName(percent),
      remember: true,
    }),
  ),
  { type: 'gold', key: 'other', label: '기타 비용 (제작비 등)', default: 0, quick: [10_000_000, 1_000_000] },
  { type: 'number', key: 'people', label: '분배 인원', default: 1, min: 1, max: 100, suffix: '명' },
];

const num = (values: Values, key: string) => {
  const value = values[key];
  return typeof value === 'number' ? value : 0;
};

function compute(values: Values, { quote }: { quote: (name: string) => number | null }): CalcResult {
  const price = num(values, 'price');
  const other = num(values, 'other');
  const people = Math.max(1, num(values, 'people'));
  const rate = values.premium === true ? PREMIUM_FEE_RATE : FEE_RATE;

  const options: FeeOption[] = [
    NO_COUPON,
    ...COUPON_PERCENTS.map((percent): FeeOption => {
      const typed = values[couponKey(percent)];
      const cost = typeof typed === 'number' ? typed : quote(couponName(percent));
      return { id: couponKey(percent), label: `${percent}% 할인`, discount: percent / 100, cost };
    }),
  ];
  const outcomes = options.map((option) => feeOutcome(price, rate, other, option));
  const best = bestOutcome(outcomes) ?? outcomes[0];
  const ranges = bestRanges(options, rate);
  const rangeOf = (id: string): Cell => {
    const each = ranges.filter((range) => range.id === id);
    // 한 선택지가 떨어진 구간 둘에서 이기는 일은 일차식 위쪽 포락선에서는 없다. 첫 구간을 보인다.
    return each.length > 0 ? { goldRange: [each[0].from, each[0].to] } : '-';
  };
  const hasUnknown = options.some((option) => option.cost === null);

  const table = {
    columns: ['선택', '수수료', '쿠폰 값', '수령액', '이 쿠폰이 유리한 판매가'],
    rows: outcomes.map((outcome): Cell[] => [
      outcome.label,
      { gold: outcome.fee - outcome.saved },
      outcome.cost === null ? '시세 없음' : { gold: outcome.cost },
      { gold: outcome.net },
      rangeOf(outcome.id),
    ]),
    highlight: outcomes.findIndex((outcome) => outcome.id === best.id),
  };

  const share =
    people > 1 && best.net !== null
      ? [{ label: `${people}명이 나누면 1인당`, gold: Math.floor(best.net / people), strong: true }]
      : [];
  const nothing = outcomes[0];

  return {
    headline: [
      { label: '가장 유리한 쿠폰', text: best.id === 'none' ? '쿠폰 안 씀' : best.label },
      { label: '수령액', gold: best.net, strong: true },
      ...share,
    ],
    table,
    details: [
      { label: `수수료 (${rate * 100}%)`, gold: nothing.fee },
      { label: '쿠폰 없이 받는 돈', gold: nothing.net },
      ...(best.id === 'none' ? [] : [{ label: '쿠폰으로 아끼는 수수료', gold: best.saved }]),
    ],
    formula:
      '수수료 = 판매가 × 5%(프리미엄·콤비네이션 4%), 할인액 = 수수료 × 쿠폰 할인율, 수령액 = 판매가 − 수수료 + 할인액 − 쿠폰 값 − 기타 비용. 쿠폰은 수령액이 가장 큰 것을 고릅니다.',
    notes: [
      '수수료와 할인액은 소수점 이하를 버려 계산합니다. 공식 안내에 반올림 규칙이 없습니다.',
      ...(hasUnknown ? ['시세가 없는 쿠폰은 비교에서 뺐습니다. 쿠폰 값을 직접 넣으면 들어갑니다.'] : []),
    ],
  };
}

export const feeCalculator: CalculatorDef = {
  id: 'fee',
  title: '경매장 수수료',
  summary: '판매가를 넣으면 수수료와 수령액을 계산하고, 할인 쿠폰 가운데 가장 많이 남는 것을 골라 줍니다.',
  fields,
  quoteNames: () => COUPON_PERCENTS.map(couponName),
  compute,
  related: [
    { label: '경매장', to: '/auction' },
    { label: '아이템 정보', to: '/items' },
  ],
};
