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

/** 개당 가격에 단위를 붙인다. */
export function formatGold(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return `${numberFormatter.format(value)} G`;
}

/**
 * 큰 가격을 억과 만으로 줄인다. 178,400,000 → "1억 7,840만 G". 칸이 좁은 표에서 쓴다.
 * 만 아래는 반올림해 버리고, 만이 안 되는 값은 그대로 적는다.
 */
export function formatGoldShort(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  if (Math.abs(value) < 10_000) return formatGold(value);
  const man = Math.round(value / 10_000);
  const eok = Math.trunc(man / 10_000);
  const rest = man % 10_000;
  const parts = [eok ? `${numberFormatter.format(eok)}억` : '', rest ? `${numberFormatter.format(rest)}만` : ''];
  return `${parts.filter(Boolean).join(' ')} G`;
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
