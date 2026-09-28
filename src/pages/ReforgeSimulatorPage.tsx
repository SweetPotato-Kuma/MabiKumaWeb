import { Flex, Typography } from 'antd';
import { ReforgeSimulatorView } from '@/components/reforge/ReforgeSimulator';
import { useReforgeSimulator } from '@/features/reforge/simulator';

const { Title } = Typography;

/** 세공 시뮬레이터. 시뮬레이터 메뉴의 두 번째 화면이다. */
export function ReforgeSimulatorPage() {
  const simulator = useReforgeSimulator();
  return (
    <Flex vertical gap={20} style={{ minWidth: 0 }}>
      <Title level={3} style={{ margin: 0 }}>
        세공 시뮬레이터
      </Title>
      <ReforgeSimulatorView simulator={simulator} />
    </Flex>
  );
}
