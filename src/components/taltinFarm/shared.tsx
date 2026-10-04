import type { ReactNode } from 'react';
import { Flex, Skeleton, Typography, theme } from 'antd';
import { GAIN_LOSS_COLORS } from '@/app/theme';
import { ItemIcon } from '@/components/ItemIcon';
import { ItemInfoLink } from '@/components/ItemInfoLink';
import { useItemNameIndexQuery } from '@/features/auction/nameIndex';
import { shortName, type Material } from '@/features/taltinFarm/data';
import type { Quote } from '@/features/taltinFarm/value';
import { formatNumber } from '@/lib/format';
import { useGoldFormatter } from '@/lib/useGoldFormatter';
import { useResolvedThemeMode } from '@/lib/themePreference';

const { Text } = Typography;

/** 표의 이름 칸 그림. 던전 코인 교환품과 같다. */
const NAME_ICON = 28;

/** 필요 물품 줄의 그림. 줄 높이에 맞춘다. */
const MATERIAL_ICON = 20;

/** 그림과 아이템 정보 상세로 가는 이름. 이름 사전의 카테고리로 그림과 주소를 찾는다. */
export function FarmItemLink({
  name,
  short = false,
  iconSize = NAME_ICON,
  suffix,
}: {
  name: string;
  short?: boolean;
  iconSize?: number;
  /** 이름 바로 뒤에 붙일 것(개수). 좁은 칸에서 이름이 줄을 바꿔도 이름 끝에 붙어 따라간다. */
  suffix?: ReactNode;
}) {
  const index = useItemNameIndexQuery().data;
  const category = index?.categoriesByName.get(name)?.[0];
  return (
    <Flex gap={6} align="center" style={{ minWidth: 0 }}>
      <ItemIcon category={category} name={name} size={iconSize} />
      <span style={{ minWidth: 0 }}>
        <ItemInfoLink name={name} category={category} label={short ? shortName(name) : undefined} />
        {suffix}
      </span>
    </Flex>
  );
}

/** 금액 칸. 받는 중이면 자리만, 모르면 "시세 없음". */
export function GoldCell({ value, pending, strong = false }: { value: number | null; pending: boolean; strong?: boolean }) {
  const formatGold = useGoldFormatter();
  if (value !== null)
    return (
      <Text strong={strong} className="tnum" style={{ whiteSpace: 'nowrap' }}>
        {formatGold(value)}
      </Text>
    );
  if (pending) return <Skeleton.Input active size="small" style={{ width: 80, minWidth: 80 }} />;
  return (
    <Text type="secondary" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
      시세 없음
    </Text>
  );
}

/** 손익 칸. 색만으로 가르지 않게 부호를 붙인다. */
export function GainCell({
  value,
  pending,
  empty = '-',
}: {
  value: number | null;
  pending: boolean;
  /** 값을 모르고 받는 중도 아닐 때 적을 말. */
  empty?: string;
}) {
  const formatGold = useGoldFormatter();
  const { token } = theme.useToken();
  const fixed = GAIN_LOSS_COLORS[useResolvedThemeMode()];
  if (value === null) {
    if (pending) return <Skeleton.Input active size="small" style={{ width: 80, minWidth: 80 }} />;
    return (
      <Text type="secondary" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
        {empty}
      </Text>
    );
  }
  const color = value >= 0 ? (fixed?.gain ?? token.colorSuccess) : (fixed?.loss ?? token.colorError);
  return (
    <Text strong className="tnum" style={{ whiteSpace: 'nowrap', color }}>
      {value > 0 ? '+' : ''}
      {formatGold(value)}
    </Text>
  );
}

/** 필요 물품. 한 줄에 물품 하나, 이름과 개수, 개당 시세. */
export function MaterialList({ materials, quote }: { materials: readonly Material[]; quote: Quote }) {
  const formatGold = useGoldFormatter();
  return (
    // 넓은 칸에서 이름과 시세가 양 끝으로 벌어지지 않게 폭을 묶는다.
    <Flex vertical gap={2} style={{ maxWidth: 300 }}>
      {materials.map(([name, qty]) => {
        const unit = quote(name);
        return (
          <Flex key={name} gap={8} justify="space-between" align="center" wrap={false} style={{ fontSize: 13 }}>
            <FarmItemLink
              name={name}
              short
              iconSize={MATERIAL_ICON}
              suffix={
                <Text type="secondary" className="tnum" style={{ whiteSpace: 'nowrap' }}>
                  {' '}
                  x{formatNumber(qty)}
                </Text>
              }
            />
            <Text type="secondary" className="tnum" style={{ whiteSpace: 'nowrap' }}>
              {unit === null ? '-' : formatGold(unit)}
            </Text>
          </Flex>
        );
      })}
    </Flex>
  );
}
