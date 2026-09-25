import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Button,
  Flex,
  Grid,
  Layout,
  Menu,
  Space,
  Tag,
  Tooltip,
  Typography,
  theme,
  type MenuProps,
} from 'antd';
import { usePageMeta } from '@/app/pageMeta';
import { HEADER_HEIGHT } from '@/app/theme';
import logoMarkDark from '@/assets/logo-mark-dark.png';
import logoMark from '@/assets/logo-mark.png';
import wordmarkDark from '@/assets/wordmark-dark.png';
import wordmark from '@/assets/wordmark.png';
import { IssueReportButton } from '@/components/IssueReportButton';
import { useHasAdminKey } from '@/lib/adminKey';
import { useEndpointMode } from '@/lib/settings';
import { useResolvedThemeMode, useThemePreference } from '@/lib/themePreference';
import { AuctionIcon, BagIcon, BookIcon, DarkModeIcon, ImageIcon, KeyIcon, LightModeIcon, ShopIcon, TicketIcon } from '@/components/icons';

const { Header, Content, Footer } = Layout;
const { Text } = Typography;

type NavItem = { key: string; icon: ReactNode; label: ReactNode; children?: NavItem[] };

/**
 * 내비는 데스크톱에서 한 줄을 넘지 않는다. 좁아지면 antd 가 알아서 넘침 메뉴로 접는다.
 *
 * NPC 상점에서 찾는 것들은 한 칸 아래로 묶는다. 상점마다 화면이 하나씩 늘어나도 헤더가
 * 한 줄을 넘지 않게 하려는 것이다. 묶음 칸 자체는 화면이 없어 누르면 펼쳐지기만 한다.
 */
const NAV_ITEMS: NavItem[] = [
  { key: '/auction', icon: <AuctionIcon />, label: <NavLink to="/auction">경매장</NavLink> },
  { key: '/items', icon: <BookIcon />, label: <NavLink to="/items">아이템 정보</NavLink> },
  {
    key: 'npc-shop',
    icon: <ShopIcon />,
    label: 'NPC 상점',
    children: [
      { key: '/bags', icon: <BagIcon />, label: <NavLink to="/bags">튼튼한 주머니</NavLink> },
      {
        key: '/magmell-pass',
        icon: <TicketIcon />,
        label: <NavLink to="/magmell-pass">마그 멜 통행증</NavLink>,
      },
    ],
  },
];

/**
 * 운영자 작업 화면. 키를 넣어 둔 브라우저에서만 메뉴에 걸린다.
 * 메뉴에 없다고 못 들어가는 것은 아니다. 주소를 치면 화면은 열리고 키를 묻는다.
 */
const ADMIN_NAV_ITEM: NavItem = {
  key: '/item-card',
  icon: <ImageIcon />,
  label: <NavLink to="/item-card">카드 만들기</NavLink>,
};

/** 현재 경로에 해당하는 메뉴 키. 루트로 들어오면 경매장이 첫 화면이다. */
function selectedKeyFor(pathname: string): string {
  const leaves = [...NAV_ITEMS, ADMIN_NAV_ITEM].flatMap((item) => item.children ?? [item]);
  const match = leaves.find((item) => pathname.startsWith(item.key));
  return match ? match.key : '/auction';
}

/**
 * 조회가 평소와 다를 때만 알린다. 프록시를 거치는 것은 방문자 대부분이 늘 보는 기본 상태라
 * 배지로 띄워도 알려 주는 것이 없다. 그때는 아무것도 그리지 않는다.
 * 설정 화면이 없으므로 키를 직접 넣는 경로는 없다. 상태만 알린다.
 */
function EndpointTag() {
  const endpoint = useEndpointMode();

  if (endpoint.apiKey) {
    return (
      <Tag icon={<KeyIcon />} color="success" style={{ marginInlineEnd: 0 }}>
        내 API 키
      </Tag>
    );
  }
  if (endpoint.viaProxy) return null;
  return (
    <Tag icon={<KeyIcon />} color="warning" style={{ marginInlineEnd: 0 }}>
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
        icon={isDark ? <LightModeIcon /> : <DarkModeIcon />}
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
  const isDark = useResolvedThemeMode() === 'dark';
  usePageMeta(location.pathname);

  const navItems: MenuProps['items'] = hasAdminKey ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

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
          <NavLink to="/auction" aria-label="마비쿠마 홈">
            <Space size={8}>
              {/* 원본은 2배 크기로 담았다. 너비와 높이를 적어 두어야 그림이 늦게 떠도 글자가 밀리지 않는다. */}
              <img src={isDark ? logoMarkDark : logoMark} alt="" width={34} height={40} style={{ display: 'block' }} />
              {/*
                로고 글자도 그림이다. 진한 갈색 글자는 어두운 배경에 묻혀서, 다크 모드에서는
                글자 속만 밝게 칠한 판을 쓴다. 외곽선은 짙게 남겨야 글자끼리 붙어 보이지 않는다.
                곰은 다크 모드에서 크림색 테두리를 두른 판을 쓴다.
              */}
              <img
                src={isDark ? wordmarkDark : wordmark}
                alt=""
                width={102}
                height={28}
                style={{ display: 'block' }}
              />
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
          . 게임 데이터는 평균 10분 지연됩니다. 개인이 만든 비공식 도구이며 넥슨과 무관합니다.{' '}
          <Link to="/privacy" style={{ fontSize: 11, color: token.colorLink }}>
            개인정보처리방침
          </Link>
        </Text>
      </Footer>

      {/* 어느 화면에서든 제보할 수 있어야 한다. 화면마다 붙이지 않고 여기 한 번만 둔다. */}
      <IssueReportButton />
    </Layout>
  );
}
