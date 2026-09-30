import { useMemo } from 'react';
import { formatGoldWith, formatNumber } from '@/lib/format';
import { useUserSettings } from '@/lib/userSettings';

/**
 * 방문자의 가격 표기 설정을 따르는 골드 포맷 함수. 설정이 바뀌면 함수가 새로 만들어져서 이 훅을 쓰는
 * 컴포넌트가 다시 그려지고, useMemo 의 의존성에 넣은 곳도 다시 계산된다. 가격 문자열은 늘 이 함수로 만든다.
 */
export type GoldFormatter = (value: number | null | undefined, unit?: boolean) => string;

export function useGoldFormatter(): GoldFormatter {
  const [{ priceStyle, omitSmall }] = useUserSettings();
  return useMemo(() => {
    const format = { style: priceStyle, omitSmall };
    return (value, unit = true) => formatGoldWith(value, format, unit);
  }, [priceStyle, omitSmall]);
}

/**
 * 가격을 단위와 함께 적는다. 골드는 설정의 표기를 따르고, 두카트 같은 다른 단위는 숫자에 단위를 붙인다.
 * 단위를 모르면(null) 숫자만 적는다.
 */
export function formatPriceWithType(
  formatGold: GoldFormatter,
  price: number,
  priceType: string | null,
): string {
  if (priceType === '골드') return formatGold(price);
  return `${formatNumber(price)} ${priceType ?? ''}`.trim();
}
