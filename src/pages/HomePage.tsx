import { Link } from 'react-router-dom';
import { ArrowRightOutlined, KeyOutlined, SettingOutlined, ShopOutlined, TagOutlined } from '@ant-design/icons';
import { Button, Card, Col, Flex, Row, Typography, theme } from 'antd';
import { useCanQuery } from '@/lib/settings';

const { Title, Paragraph, Text } = Typography;

const FEATURES = [
  {
    to: '/auction',
    icon: <TagOutlined />,
    title: '경매장 조회',
    body: '카테고리나 아이템 이름으로 매물을 찾고 개당 가격의 최저, 중위, 평균을 봅니다. 최근 1시간 거래 내역도 함께 확인합니다.',
  },
  {
    to: '/npc-shop',
    icon: <ShopOutlined />,
    title: 'NPC 상점 조회',
    body: '서버와 채널, NPC를 골라 상점 탭별 판매 목록과 가격, 구매 제한, 다음 갱신 시각을 확인합니다.',
  },
  {
    to: '/settings',
    icon: <SettingOutlined />,
    title: '설정',
    body: '내 API 키를 쓰거나 프록시 주소를 바꿉니다. 화면 테마도 여기서 고릅니다. 값은 이 브라우저에만 저장됩니다.',
  },
] as const;

const KEY_STEPS = [
  <>
    <Typography.Link href="https://openapi.nexon.com/" target="_blank" rel="noreferrer">
      NEXON Open API
    </Typography.Link>
    에 넥슨 계정으로 로그인합니다.
  </>,
  <>&apos;내 애플리케이션&apos; 메뉴에서 애플리케이션을 등록합니다.</>,
  <>발급된 API Key를 복사해 이 사이트의 설정 화면에 붙여넣습니다.</>,
];

export function HomePage() {
  const canQuery = useCanQuery();
  const { token } = theme.useToken();

  return (
    <Flex vertical gap={28}>
      <section>
        <Title level={2} style={{ marginBottom: 8 }}>
          마비노기 도구상자
        </Title>
        <Paragraph type="secondary" style={{ maxWidth: '58ch', fontSize: 16 }}>
          넥슨 오픈 API로 경매장 시세와 NPC 상점을 조회합니다. 키는 프록시가 들고 있어 브라우저로 내려오지 않습니다.
        </Paragraph>
        <Link to={canQuery ? '/auction' : '/settings'}>
          <Button type="primary" size="large" icon={canQuery ? <ArrowRightOutlined /> : <KeyOutlined />}>
            {canQuery ? '경매장 조회 시작' : 'API 키 등록하기'}
          </Button>
        </Link>
      </section>

      {/* 3단 그리드. 768px 미만에서는 한 단으로 떨어진다. */}
      <Row gutter={[16, 16]}>
        {FEATURES.map((feature) => (
          <Col key={feature.to} xs={24} md={8}>
            <Link to={feature.to} style={{ display: 'block', height: '100%' }}>
              <Card hoverable variant="outlined" style={{ height: '100%' }}>
                <Flex vertical gap={10}>
                  <Flex align="center" gap={10}>
                    <span style={{ color: token.colorPrimary, fontSize: 18, lineHeight: 1 }} aria-hidden="true">
                      {feature.icon}
                    </span>
                    <Text strong style={{ fontSize: 16 }}>
                      {feature.title}
                    </Text>
                  </Flex>
                  <Text type="secondary" style={{ fontSize: 14 }}>
                    {feature.body}
                  </Text>
                </Flex>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>

      <Card title="API 키 발급 방법" variant="outlined">
        <Flex vertical gap={10} component="ol" style={{ margin: 0, paddingInlineStart: 20 }}>
          {KEY_STEPS.map((step, index) => (
            <li key={index}>
              <Text type="secondary">{step}</Text>
            </li>
          ))}
        </Flex>
      </Card>
    </Flex>
  );
}
