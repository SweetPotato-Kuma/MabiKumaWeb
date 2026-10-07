import { Flex, Typography } from 'antd';
import { EchostoneSimulatorView } from '@/components/echostone/EchostoneSimulator';

const { Title } = Typography;

/** 에코스톤 각성 시뮬레이터. */
export function EchostoneSimulatorPage() {
  return (
    <Flex vertical gap={20} style={{ minWidth: 0 }}>
      <Title level={3} style={{ margin: 0 }}>
        에코스톤 각성 시뮬레이터
      </Title>
      <EchostoneSimulatorView />
    </Flex>
  );
}
