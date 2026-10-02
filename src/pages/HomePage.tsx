import { Link } from 'react-router-dom';
import { Card, Col, Flex, Row, Typography, theme } from 'antd';
import { NAV_TREE, navPages } from '@/app/navigation';

const { Title, Text } = Typography;

/**
 * 첫 화면. 사이트 이름과 화면 바로가기.
 *
 * 예전에는 루트(/)가 곧장 경매장으로 넘어갔다. 구글은 그것을 리다이렉트로 읽어 첫 화면을 수집하지
 * 않았고, 그래서 첫 화면에 실어 둔 사이트 이름과 아이콘도 읽지 못해 검색 결과에 도메인과 기본 아이콘이
 * 떴다. 루트가 제 자리에서 화면을 그려야 구글이 첫 화면으로 본다.
 *
 * 칸 목록은 메뉴와 같은 표(app/navigation.tsx)를 읽는다. 화면을 하나 더하면 여기에도 저절로 생긴다.
 */
export function HomePage() {
  const { token } = theme.useToken();
  const pages = navPages(NAV_TREE);

  return (
    <Flex vertical gap={24}>
      <Flex vertical gap={4}>
        <Title level={3} style={{ margin: 0 }}>
          마비쿠마
        </Title>
        <Text type="secondary">마비노기 경매장 시세와 아이템 정보, 시뮬레이터와 계산기</Text>
      </Flex>

      {/* 768px 미만은 한 줄에 하나, 넓어질수록 둘, 셋, 넷. */}
      <Row gutter={[16, 16]}>
        {pages.map(({ leaf, trail }) => (
          <Col key={leaf.path} xs={24} sm={12} lg={8} xl={6}>
            <Link to={leaf.path}>
              <Card hoverable size="small" style={{ height: '100%' }}>
                <Flex align="center" gap={12}>
                  <span style={{ display: 'flex', fontSize: 24, color: token.colorPrimary }} aria-hidden="true">
                    {leaf.icon}
                  </span>
                  <Flex vertical>
                    <Text strong>{leaf.label}</Text>
                    {trail ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {trail}
                      </Text>
                    ) : null}
                  </Flex>
                </Flex>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
    </Flex>
  );
}
