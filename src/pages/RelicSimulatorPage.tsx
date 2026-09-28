import { Flex, Typography } from 'antd';
import { RelicSimulatorView } from '@/components/relics/RelicSimulator';
import { useRelicPrices } from '@/features/relics/priceFile';
import { useRelicSimulator } from '@/features/relics/simulator';

const { Title } = Typography;

/** 무리아스의 유물(이데아) 복원 시뮬레이터. 시뮬레이터 메뉴의 첫 화면이다. */
export function RelicSimulatorPage() {
  const simulator = useRelicSimulator();
  const prices = useRelicPrices();
  return (
    <Flex vertical gap={20} style={{ minWidth: 0 }}>
      <Title level={3} style={{ margin: 0 }}>
        무리아스의 유물 복원 시뮬레이터
      </Title>
      <RelicSimulatorView simulator={simulator} prices={prices} />
    </Flex>
  );
}
