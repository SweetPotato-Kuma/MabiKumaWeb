import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ApiOutlined,
  BookOutlined,
  KeyOutlined,
  MoonOutlined,
  PictureOutlined,
  ShopOutlined,
  SunOutlined,
  TagOutlined,
} from '@ant-design/icons';
import { Button, Flex, Grid, Layout, Menu, Space, Tag, Tooltip, Typography, theme } from 'antd';
import { HEADER_HEIGHT } from '@/app/theme';
import { IssueReportButton } from '@/components/IssueReportButton';
import { useHasAdminKey } from '@/lib/adminKey';
import { useEndpointMode } from '@/lib/settings';
import { useResolvedThemeMode, useThemePreference } from '@/lib/themePreference';

const { Header, Content, Footer } = Layout;
const { Text } = Typography;

/** 내비는 데스크톱에서 한 줄을 넘지 않는다. 좁아지면 antd 가 알아서 넘침 메뉴로 접는다. */
const NAV_ITEMS = [
  { key: '/auction', icon: <TagOutlined />, label: <NavLink to="/auction">경매장</NavLink> },
  { key: '/dictionary', icon: <BookOutlined />, label: <NavLink to="/dictionary">아이템 사전</NavLink> },
  { key: '/npc-shop', icon: <ShopOutlined />, label: <NavLink to="/npc-shop">NPC 상점</NavLink> },
];

/**
 * 운영자 작업 화면. 키를 넣어 둔 브라우저에서만 메뉴에 걸린다.
 * 메뉴에 없다고 못 들어가는 것은 아니다. 주소를 치면 화면은 열리고 키를 묻는다.
 */
const ADMIN_NAV_ITEM = {
  key: '/item-card',
  icon: <PictureOutlined />,
  label: <NavLink to="/item-card">카드 만들기</NavLink>,
};

/** 현재 경로에 해당하는 메뉴 키. 루트로 들어오면 경매장이 첫 화면이다. */
function selectedKeyFor(pathname: string): string {
  const match = [...NAV_ITEMS, ADMIN_NAV_ITEM].find((item) => pathname.startsWith(item.key));
  return match ? match.key : '/auction';
}

/**
 * 지금 요청이 어디로 나가는지. 실제 상태라서 배지로 보여 줄 값이 맞다.
 * 설정 화면이 없으므로 키를 직접 넣는 경로는 없다. 상태만 알린다.
 */
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
    <Tag icon={<KeyOutlined />} color="warning" style={{ marginInlineEnd: 0 }}>
      조회 불가
    </Tag>
  );
}

/**
 * 밝기 토글. 설정 화면을 없앴으므로 다크 모드를 고를 자리가 헤더뿐이다.
 * 누르면 지금 보고 있는 것의 반대로 넘어가고, 그 선택이 이 브라우저에 남는다.
 */
function ThemeToggle() {
  const mode = useResolvedThemeMode();
  const [, setPreference] = useThemePreference();
  const isDark = mode === 'dark';

  return (
    <Tooltip title={isDark ? '라이트 모드로' : '다크 모드로'}>
      <Button
        type="text"
        aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
        icon={isDark ? <SunOutlined /> : <MoonOutlined />}
        onClick={() => setPreference(isDark ? 'light' : 'dark')}
      />
    </Tooltip>
  );
}

export function RootLayout() {
  const location = useLocation();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const hasAdminKey = useHasAdminKey();

  const navItems = hasAdminKey ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

  /**
   * 본문 폭. 1160 은 좁아서 넓은 화면에서 좌우가 한참 비었다. 표가 주인공인 화면이라
   * 가로를 넓게 쓰는 편이 낫다. 1600 이면 1920 화면에서 양옆에 160px 씩 남아
   * 광고 한 줄이 들어갈 자리는 유지된다.
   */
  const containerStyle = {
    width: '100%',
    maxWidth: 1600,
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
          height: HEADER_HEIGHT,
          lineHeight: `${HEADER_HEIGHT}px`,
          borderBottom: `1px solid ${token.colorBorder}`,
          background: token.colorBgContainer,
          // 본문이 헤더 밑으로 지나갈 때 경계가 분명해야 한다. 배경색 계열로만 옅게 깐다.
          boxShadow: token.boxShadowTertiary,
        }}
      >
        {/* Header 가 물려주는 line-height 를 여기서 끊는다. 배지와 글자가 세로로 늘어난다. */}
        <Flex align="center" gap={screens.md ? 28 : 12} style={{ ...containerStyle, lineHeight: 'normal' }}>
          <NavLink to="/auction" aria-label="MabiKuma 홈" style={{ color: token.colorText }}>
            <Space size={10}>
              <span aria-hidden="true" style={{ fontSize: 26 }}>
                🐻
              </span>
              <Text strong style={{ fontSize: 20, whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
                MabiKuma
              </Text>
            </Space>
          </NavLink>

          <nav aria-label="주요 메뉴" style={{ flex: 1, minWidth: 0 }}>
            <Menu
              mode="horizontal"
              items={navItems}
              selectedKeys={[selectedKeyFor(location.pathname)]}
              style={{
                borderBottom: 'none',
                background: 'transparent',
                lineHeight: `${HEADER_HEIGHT}px`,
              }}
            />
          </nav>

          <Space size={8}>
            {screens.sm ? <EndpointTag /> : null}
            <ThemeToggle />
          </Space>
        </Flex>
      </Header>

      <Content style={{ ...containerStyle, paddingBlock: screens.md ? 32 : 20 }}>
        <Outlet />
      </Content>

      {/*
        푸터는 읽히려고 있는 자리가 아니라 고지를 지키려고 있는 자리다. 한 줄로 줄이고
        글자도 작게 둔다. 지연 고지와 비공식 고지는 지우지 않는다.
      */}
      <Footer
        style={{
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          textAlign: 'center',
          paddingBlock: 12,
        }}
      >
        <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.6 }}>
          데이터 출처{' '}
          <Typography.Link
            href="https://openapi.nexon.com/ko/game/mabinogi/"
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 11 }}
          >
            NEXON Open API
          </Typography.Link>
          . 게임 데이터는 평균 10분 지연됩니다. 개인이 만든 비공식 도구이며 넥슨과 무관합니다.
        </Text>
      </Footer>

      {/* 어느 화면에서든 제보할 수 있어야 한다. 화면마다 붙이지 않고 여기 한 번만 둔다. */}
      <IssueReportButton />
    </Layout>
  );
}
