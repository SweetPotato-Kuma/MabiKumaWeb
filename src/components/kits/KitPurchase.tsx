import { Collapse, Flex, Select, Table, Typography, type TableColumnsType } from 'antd';
import type { Kit } from '@/features/kits/kits';
import { quoteKitPurchase, type KitBundle, type PurchaseMode } from '@/features/kits/pricing';
import { formatNumber } from '@/lib/format';

const { Text, Link } = Typography;

export function KitPurchaseOptions({
  kit,
  mode,
  onMode,
}: {
  kit: Kit;
  mode: PurchaseMode;
  onMode: (mode: PurchaseMode) => void;
}) {
  if (!kit.pricing) return null;
  const columns: TableColumnsType<KitBundle> = [
    { title: '구매 옵션', dataIndex: 'label' },
    {
      title: '판매가',
      key: 'cash',
      align: 'right',
      render: (_, row) => (
        <Flex vertical>
          <Text>{formatNumber(row.saleCash)} 캐시</Text>
          {row.regularCash > row.saleCash ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {formatNumber(row.regularCash - row.saleCash)} 캐시 할인
            </Text>
          ) : null}
        </Flex>
      ),
    },
    {
      title: '예상 마일리지',
      key: 'mileage',
      align: 'right',
      render: (_, row) =>
        row.mileageRatePercent === null
          ? '미확인'
          : `${formatNumber((row.saleCash * row.mileageRatePercent) / 100)} (${formatNumber(row.mileageRatePercent)}%)`,
    },
  ];
  return (
    <Flex vertical gap={8}>
      <Flex gap={8} align="center" wrap>
        <Text>가격 계산</Text>
        <Select<PurchaseMode>
          aria-label="가격 계산 방식"
          value={mode}
          onChange={onMode}
          options={[
            { value: 'bundles', label: '묶음 조합 최저가' },
            { value: 'single', label: '개별 구매' },
          ]}
          style={{ minWidth: 170 }}
        />
      </Flex>
      <Collapse
        size="small"
        items={[
          {
            key: 'pricing',
            label: '구매 가격·마일리지',
            children: (
              <Flex vertical gap={8}>
                <Table
                  columns={columns}
                  dataSource={kit.pricing.bundles}
                  rowKey="productId"
                  pagination={false}
                  size="small"
                  scroll={{ x: 320 }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <Link href={kit.pricing.source} target="_blank" rel="noopener noreferrer">
                    공식 상점
                  </Link>
                  {' · '}
                  {new Date(kit.pricing.checkedAt).toLocaleString('ko-KR')} 확인
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  구매 상품을 수령할 때의 예상 적립량입니다. 보상 아이템 반환 마일리지는 포함하지
                  않습니다. 소수점이 있으면 실제 지급량과 다를 수 있습니다.
                </Text>
              </Flex>
            ),
          },
        ]}
      />
    </Flex>
  );
}

/** 목표 횟수 계산도 결과와 같은 가격 정책을 쓴다. */
export function KitPurchaseEstimate({
  kit,
  count,
  mode,
}: {
  kit: Kit;
  count: number;
  mode: PurchaseMode;
}) {
  const quote = quoteKitPurchase(kit, count, mode);
  if (!quote) return null;
  return (
    <Text className="tnum" style={{ fontSize: 13 }}>
      해당 횟수 구매 <Text strong>{formatNumber(quote.cash)} 캐시</Text>
      {' · '}예상 마일리지 {quote.mileage === null ? '미확인' : formatNumber(quote.mileage)}
    </Text>
  );
}
