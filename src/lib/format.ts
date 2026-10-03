const numberFormatter = new Intl.NumberFormat('ko-KR');

const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** 12345 → "12,345" */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return numberFormatter.format(value);
}

/** 가격을 어떻게 적을지. 방문자의 설정(userSettings)에서 온다. */
export interface PriceFormat {
  /** number: `1,149,000,000 G`, korean: `11억 4,900만 G`. */
  style: 'number' | 'korean';
  /** 한글 표기에서 1만 미만 끝자리를 뺀다. 만이 안 되는 값은 그대로 적는다. */
  omitSmall: boolean;
}

export const DEFAULT_PRICE_FORMAT: PriceFormat = { style: 'number', omitSmall: false };

const EOK = 100_000_000;
const MAN = 10_000;

/**
 * 골드 가격을 적는 유일한 함수. 화면의 가격은 모두 이 함수를 거친다(useGoldFormatter).
 * 자리를 아끼려고 화면마다 다르게 줄이던 것을 하나로 합쳤다. 줄여 적고 싶으면 설정에서 한글 표기를 고른다.
 *
 * unit 을 끄면 " G" 를 뗀다. 가격만 늘어선 좁은 칸에서 쓴다.
 */
export function formatGoldWith(
  value: number | null | undefined,
  format: PriceFormat = DEFAULT_PRICE_FORMAT,
  unit = true,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const suffix = unit ? ' G' : '';
  if (format.style === 'number') return `${numberFormatter.format(value)}${suffix}`;

  const sign = value < 0 ? '-' : '';
  const amount = Math.round(Math.abs(value));
  if (amount < MAN) return `${sign}${numberFormatter.format(amount)}${suffix}`;
  const eok = Math.floor(amount / EOK);
  const man = Math.floor((amount % EOK) / MAN);
  const rest = amount % MAN;
  const parts = [
    eok ? `${numberFormatter.format(eok)}억` : '',
    man ? `${numberFormatter.format(man)}만` : '',
    rest && !format.omitSmall ? numberFormatter.format(rest) : '',
  ];
  return `${sign}${parts.filter(Boolean).join(' ')}${suffix}`;
}

/** 네 자리 묶음을 소리 내어 읽듯 적는다. 3000 → "3천", 3456 → "3천456". 만 자리를 넘으면 숫자 그대로. */
function readGroup(group: number): string {
  if (group >= MAN) return numberFormatter.format(group);
  const thousands = Math.floor(group / 1000);
  const rest = group % 1000;
  return `${thousands ? `${thousands}천` : ''}${rest ? rest : ''}`;
}

/** 입력한 금액을 읽기 쉽게. 30,000,456 → "3천만 456", 1,231,000,000 → "12억 3천100만". */
export function formatKoreanReading(value: number): string {
  const amount = Math.round(Math.abs(value));
  const eok = Math.floor(amount / EOK);
  const man = Math.floor((amount % EOK) / MAN);
  const rest = amount % MAN;
  const parts = [eok ? `${readGroup(eok)}억` : '', man ? `${readGroup(man)}만` : '', rest ? readGroup(rest) : ''];
  return `${value < 0 ? '-' : ''}${parts.filter(Boolean).join(' ') || '0'}`;
}

/** API 가 주는 UTC ISO 문자열을 로컬 시간 문자열로 바꾼다. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateTimeFormatter.format(date);
}

/** 남은 시간을 "2일 3시간" 같은 사람이 읽는 형태로 바꾼다. */
export function formatRemaining(isoDate: string | null | undefined, now = Date.now()): string {
  if (!isoDate) return '-';
  const target = new Date(isoDate).getTime();
  if (Number.isNaN(target)) return '-';

  const diffMinutes = Math.floor((target - now) / 60_000);
  if (diffMinutes <= 0) return '만료';

  const days = Math.floor(diffMinutes / (60 * 24));
  const hours = Math.floor((diffMinutes % (60 * 24)) / 60);
  const minutes = diffMinutes % 60;

  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}
