import { Link } from 'react-router-dom';
import { Flex, Typography } from 'antd';
import { RelicSimulatorView } from '@/components/relics/RelicSimulator';
import { useRelicPrices } from '@/features/relics/priceFile';
import { useRelicSimulator } from '@/features/relics/simulator';

const { Title, Text } = Typography;

/** 무리아스의 유물(이데아) 복원 시뮬레이터. 시뮬레이터 메뉴의 첫 화면이다. */
export function RelicSimulatorPage() {
  const simulator = useRelicSimulator();
  const prices = useRelicPrices();
  return (
    <Flex vertical gap={20} style={{ minWidth: 0 }}>
      <Flex vertical gap={4}>
        <Title level={3} style={{ margin: 0 }}>
          무리아스의 유물 복원 시뮬레이터
        </Title>
        <Text type="secondary">
          이데아를 골드 없이 복원해 보고, 나온 옵션과 레벨에 경매장 시세를 붙여 봅니다. 옵션과
          레벨마다의 시세는 <Link to="/relics">유물 시세</Link>에서 봅니다.
        </Text>
      </Flex>
      <RelicSimulatorView simulator={simulator} prices={prices} />
    </Flex>
  );
}
