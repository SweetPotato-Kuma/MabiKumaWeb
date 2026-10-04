import { useSearchParams } from 'react-router-dom';
import { Alert, Button, Flex, Segmented, Tabs, Typography } from 'antd';
import { RefreshIcon } from '@/components/icons';
import { CraftTab } from '@/components/taltinFarm/CraftTab';
import { DucatTab } from '@/components/taltinFarm/DucatTab';
import { OrdersTab } from '@/components/taltinFarm/OrdersTab';
import { snapshotAgeLabel } from '@/features/auction/snapshot';
import type { QuoteBasis } from '@/features/calculators/quotes';
import { useFarmQuotes } from '@/features/taltinFarm/quotes';
import { formatNumber } from '@/lib/format';
import { useCanQuery } from '@/lib/settings';

const { Title, Text } = Typography;

type Tab = 'orders' | 'craft' | 'ducat';

const TAB_ITEMS: { key: Tab; label: string }[] = [
  { key: 'orders', label: '납품' },
  { key: 'craft', label: '가공' },
  { key: 'ducat', label: '두카트' },
];

const tabOf = (value: string | null): Tab => (value === 'craft' || value === 'ducat' ? value : 'orders');

/**
 * 탈틴 농장 계산기. 생활 협회 주문 납품, 마법의 솥 가공, 두카트 환전 손익을 탭 셋으로 나눈다.
 * 고른 탭과 시세 기준은 주소에 담고, 주문마다 고른 보상은 이 브라우저에 남긴다(features/taltinFarm/store.ts).
 */
export function TaltinFarmPage() {
  const canQuery = useCanQuery();
  const [params, setParams] = useSearchParams();
  const tab = tabOf(params.get('tab'));
  const basis: QuoteBasis = params.get('basis') === 'mid' ? 'mid' : 'lowest';
  const { quote, pending, failed, asOf, retry } = useFarmQuotes(basis);

  const setParam = (key: string, value: string | null) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value === null) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const loading = pending > 0;

  // 시세 기준은 탭마다 표 바로 위 도구 줄에 둔다(두카트 탭은 비율 칸과 한 줄). 고른 값은 탭을 옮겨도 그대로다.
  const basisControl = (
    <Flex gap={10} align="center" wrap>
      <Segmented<QuoteBasis>
        aria-label="시세 기준"
        value={basis}
        onChange={(next) => setParam('basis', next === 'mid' ? 'mid' : null)}
        options={[
          { value: 'lowest', label: '경매장 최저가' },
          { value: 'mid', label: '1일 중위' },
        ]}
      />
      <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
        {loading
          ? `시세 ${formatNumber(pending)}종을 받는 중입니다.`
          : asOf === null
            ? '평균 10분 지연된 시세입니다.'
            : `${snapshotAgeLabel(asOf)} 모은 시세, 평균 10분 지연`}
      </Text>
    </Flex>
  );
  const tabProps = { quote, pending: loading, basisControl };

  return (
    <Flex vertical gap={16}>
      <Title level={3} style={{ margin: 0 }}>
        탈틴 농장 계산기
      </Title>

      {!canQuery ? (
        <Alert
          type="warning"
          showIcon
          message="지금은 경매장 시세를 받을 수 없습니다. 조회 서버 주소가 설정되지 않았습니다."
        />
      ) : null}

      {failed.length > 0 ? (
        <Alert
          type="error"
          showIcon
          role="alert"
          message={`시세 ${formatNumber(failed.length)}종을 받지 못했습니다`}
          action={
            <Button size="small" icon={<RefreshIcon />} onClick={retry}>
              다시 받기
            </Button>
          }
        />
      ) : null}

      <Tabs
        activeKey={tab}
        onChange={(key) => setParam('tab', key === 'orders' ? null : key)}
        items={TAB_ITEMS}
        tabBarStyle={{ marginBottom: 0 }}
      />

      {tab === 'orders' ? <OrdersTab {...tabProps} /> : tab === 'craft' ? <CraftTab {...tabProps} /> : <DucatTab {...tabProps} />}
    </Flex>
  );
}
