import { Link, Navigate } from 'react-router-dom';
import { Card, Col, Flex, Row, Typography } from 'antd';
import { CalculatorView } from '@/components/calculators/CalculatorView';
import { CALCULATORS, calculatorOf, calculatorPath } from '@/features/calculators/registry';

const { Title, Text } = Typography;

/** 계산기 목록. 계산기마다 카드 하나다. */
export function CalculatorListPage() {
  return (
    <Flex vertical gap={16}>
      <Flex vertical gap={4}>
        <Title level={3} style={{ margin: 0 }}>
          계산기
        </Title>
        <Text type="secondary">값을 넣으면 바로 계산해 주는 도구 모음입니다. 경매장 시세를 자동으로 채워 줍니다.</Text>
      </Flex>
      <Row gutter={[16, 16]}>
        {CALCULATORS.map((calculator) => (
          <Col key={calculator.id} xs={24} md={12} xl={8}>
            <Link to={calculatorPath(calculator.id)} aria-label={`${calculator.title} 계산기`}>
              <Card variant="outlined" hoverable>
                <Flex vertical gap={6}>
                  <Text strong style={{ fontSize: 16 }}>
                    {calculator.title}
                  </Text>
                  <Text type="secondary">{calculator.summary}</Text>
                </Flex>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
    </Flex>
  );
}

/** 계산기 한 화면. 라우터가 계산기마다 자기 경로에 이 화면을 걸고 id 를 넘긴다. 모르는 id 는 목록으로 보낸다. */
export function CalculatorPage({ id }: { id: string }) {
  const calculator = calculatorOf(id);
  if (!calculator) return <Navigate to="/calculators" replace />;
  return <CalculatorView key={calculator.id} def={calculator} />;
}
