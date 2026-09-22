import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ApiOutlined, HomeOutlined, KeyOutlined, SettingOutlined, ShopOutlined, TagOutlined } from '@ant-design/icons';
import { Flex, Grid, Layout, Menu, Space, Tag, Typography, theme } from 'antd';
import { useEndpointMode } from '@/lib/settings';

const { Header, Content, Footer } = Layout;
const { Text } = Typography;

/** 내비는 데스크톱에서 한 줄을 넘지 않는다. 좁아지면 antd 가 알아서 넘침 메뉴로 접는다. */
const NAV_ITEMS = [
  { key: '/', icon: <HomeOutlined />, label: <NavLink to="/">홈</NavLink> },
  { key: '/auction', icon: <TagOutlined />, label: <NavLink to="/auction">경매장</NavLink> },
  { key: '/npc-shop', icon: <ShopOutlined />, label: <NavLink to="/npc-shop">NPC 상점</NavLink> },
  { key: '/settings', icon: <SettingOutlined />, label: <NavLink to="/settings">설정</NavLink> },
];

/** 현재 경로에 해당하는 메뉴 키. 하위 경로가 생겨도 첫 구간으로 맞춘다. */
function selectedKeyFor(pathname: string): string {
  const match = NAV_ITEMS.find((item) => item.key !== '/' && pathname.startsWith(item.key));
  return match ? match.key : '/';
}

/** 지금 요청이 어디로 나가는지. 실제 상태라서 배지로 보여 줄 값이 맞다. */
function EndpointTag() {
  const endpoint = useEndpointMode();

  if (endpoint.apiKey) {
    return (
      <Tag icon={<KeyOutlined />} color="success" style={{ marginInlineEnd: 0 }}>
        내 API 키
      </Tag>
    );
  }
  if (endpoint.viaProxy) {
    return (
      <Tag icon={<ApiOutlined />} color="processing" style={{ marginInlineEnd: 0 }}>
        프록시 경유
      </Tag>
    );
  }
  return (
    <Link to="/settings">
      <Tag icon={<KeyOutlined />} color="warning" style={{ marginInlineEnd: 0 }}>
        API 키 없음
      </Tag>
    </Link>
  );
}

export function RootLayout() {
  const location = useLocation();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();

  const containerStyle = {
    width: '100%',
    maxWidth: 1160,
    marginInline: 'auto',
    paddingInline: screens.md ? 24 : 16,
  } as const;

  return (
    <Layout style={{ minHeight: '100dvh', background: token.colorBgLayout }}>
      <Header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          height: 64,
          lineHeight: '64px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          background: token.colorBgContainer,
        }}
      >
        {/* Header 가 물려주는 line-height 64px 를 여기서 끊는다. 배지와 글자가 세로로 늘어난다. */}
        <Flex align="center" gap={screens.md ? 24 : 12} style={{ ...containerStyle, lineHeight: 'normal' }}>
          <Link to="/" aria-label="MabiKuma 홈" style={{ color: token.colorText }}>
            <Space size={8}>
              <span aria-hidden="true" style={{ fontSize: 20 }}>
                🐻
              </span>
              <Text strong style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
                MabiKuma
              </Text>
            </Space>
          </Link>

          <nav aria-label="주요 메뉴" style={{ flex: 1, minWidth: 0 }}>
            <Menu
              mode="horizontal"
              items={NAV_ITEMS}
              selectedKeys={[selectedKeyFor(location.pathname)]}
              style={{ borderBottom: 'none', background: 'transparent' }}
            />
          </nav>

          {screens.sm ? <EndpointTag /> : null}
        </Flex>
      </Header>

      <Content style={{ ...containerStyle, paddingBlock: screens.md ? 32 : 20 }}>
        <Outlet />
      </Content>

      <Footer style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, textAlign: 'center' }}>
        <Flex vertical align="center" gap={4}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            데이터 출처{' '}
            <Typography.Link href="https://openapi.nexon.com/ko/game/mabinogi/" target="_blank" rel="noreferrer">
              NEXON Open API
            </Typography.Link>
            . 게임 데이터는 평균 10분 지연됩니다.
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            개인이 만든 비공식 도구이며 넥슨과 무관합니다.
          </Text>
        </Flex>
      </Footer>
    </Layout>
  );
}
