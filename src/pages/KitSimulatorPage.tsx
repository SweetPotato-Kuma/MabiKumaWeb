import { Flex, Typography } from 'antd';
import { KitSimulatorView } from '@/components/kits/KitSimulator';

const { Title } = Typography;

/** 키트(확률형 상품) 시뮬레이터. */
export function KitSimulatorPage() {
  return (
    <Flex vertical gap={20} style={{ minWidth: 0 }}>
      <Title level={3} style={{ margin: 0 }}>
        키트 시뮬레이터
      </Title>
      <KitSimulatorView />
    </Flex>
  );
}
