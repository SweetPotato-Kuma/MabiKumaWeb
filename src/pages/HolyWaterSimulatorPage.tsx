import { Flex, Typography } from 'antd';
import { HolyWaterSimulatorView } from '@/components/holyWater/HolyWaterSimulator';
import { useHolyWaterSimulator } from '@/features/holyWater/simulator';

const { Title } = Typography;

/** 무리아스의 성수 시뮬레이터. 시뮬레이터 메뉴의 세 번째 화면이다. */
export function HolyWaterSimulatorPage() {
  const simulator = useHolyWaterSimulator();
  return (
    <Flex vertical gap={20} style={{ minWidth: 0 }}>
      <Title level={3} style={{ margin: 0 }}>
        무리아스의 성수 시뮬레이터
      </Title>
      <HolyWaterSimulatorView simulator={simulator} />
    </Flex>
  );
}
