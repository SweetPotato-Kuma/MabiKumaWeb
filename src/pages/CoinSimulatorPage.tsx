import { Flex, Tabs, Typography } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { CoinSimulatorView } from '@/components/coins/CoinSimulator';
import {
  COIN_DUNGEONS,
  UPCOMING_COIN_DUNGEONS,
  useCoinSimulator,
  type CoinDungeon,
} from '@/features/coins/simulator';

const { Title } = Typography;

/** 던전 한 칸. 탭을 바꿔도 다른 던전의 기록이 섞이지 않게 던전마다 따로 그린다. */
function DungeonPane({ dungeon }: { dungeon: CoinDungeon }) {
  const simulator = useCoinSimulator(dungeon);
  return <CoinSimulatorView dungeon={dungeon} simulator={simulator} />;
}

/**
 * 던전 주화 시뮬레이터. 던전마다 탭이 하나다. 첫 던전은 주소에 tab 을 남기지 않는다.
 * 아직 주화가 나오지 않은 던전은 탭만 보이고 고를 수 없다.
 */
export function CoinSimulatorPage() {
  const [params, setParams] = useSearchParams();
  const first = COIN_DUNGEONS[0];
  const dungeon = COIN_DUNGEONS.find((each) => each.key === params.get('tab')) ?? first;
  return (
    <Flex vertical gap={20} style={{ minWidth: 0 }}>
      <Title level={3} style={{ margin: 0 }}>
        주화 시뮬레이터
      </Title>
      <Tabs
        activeKey={dungeon.key}
        onChange={(key) => setParams(key === first.key ? {} : { tab: key }, { replace: true })}
        items={[
          ...COIN_DUNGEONS.map((each) => ({
            key: each.key,
            label: each.label,
            children: <DungeonPane dungeon={each} />,
          })),
          ...UPCOMING_COIN_DUNGEONS.map((each) => ({
            key: each.key,
            label: `${each.label} (준비 중)`,
            disabled: true,
          })),
        ]}
      />
    </Flex>
  );
}
