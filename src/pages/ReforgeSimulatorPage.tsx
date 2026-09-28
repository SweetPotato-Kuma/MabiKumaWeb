import { Flex, Typography } from 'antd';
import { ReforgeSimulatorView } from '@/components/reforge/ReforgeSimulator';
import { useReforgeSimulator } from '@/features/reforge/simulator';

const { Title, Text } = Typography;

/** 세공 시뮬레이터. 시뮬레이터 메뉴의 두 번째 화면이다. */
export function ReforgeSimulatorPage() {
  const simulator = useReforgeSimulator();
  return (
    <Flex vertical gap={20} style={{ minWidth: 0 }}>
      <Flex vertical gap={4}>
        <Title level={3} style={{ margin: 0 }}>
          세공 시뮬레이터
        </Title>
        <Text type="secondary">
          세공 도구와 장비 종류를 고르고 세공해 봅니다. 붙은 옵션 세 줄과 지금까지 도구값으로 쓴
          골드를 셉니다.
        </Text>
      </Flex>
      <ReforgeSimulatorView simulator={simulator} />
    </Flex>
  );
}
