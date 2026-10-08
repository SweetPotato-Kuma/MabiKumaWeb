import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Button,
  Drawer,
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
import {
  ADMIN_NAV_ITEM,
  NAV_TREE,
  isNavGroup,
  selectedPathFor,
  type NavEntry,
  type NavLeaf,
} from '@/app/navigation';
import { usePageMeta } from '@/app/pageMeta';
import { HEADER_HEIGHT, hasFullNav, headerHeightFor } from '@/app/theme';
import logoMarkDark from '@/assets/logo-mark-dark.png';
import logoMark from '@/assets/logo-mark.png';
import wordmarkDark from '@/assets/wordmark-dark.png';
import wordmark from '@/assets/wordmark.png';
import { CommandPalette } from '@/components/CommandPalette';
import { ErinnClockButton, ErinnClockDetail } from '@/components/ErinnClock';
import { IssueReportModal, IssueReportTrigger } from '@/components/IssueReportButton';
import { SettingsButton, SettingsPanel } from '@/components/SettingsPanel';
import { prefetchRelicPrices } from '@/features/relics/priceFile';
import { useHasAdminKey } from '@/lib/adminKey';
import { GAME_DATA_FAILURE_EVENT } from '@/lib/gameData';
import { searchShortcutLabel, useSearchShortcut } from '@/lib/searchShortcut';
import { useServerClockSync } from '@/lib/serverClock';
import { useEndpointMode } from '@/lib/settings';
import { useResolvedThemeMode, useThemePreference } from '@/lib/themePreference';
import { DarkModeIcon, KeyIcon, LightModeIcon, MenuIcon, SearchIcon } from '@/components/icons';

const { Header, Content, Footer } = Layout;
const { Text } = Typography;

type MenuItem = NonNullable<MenuProps['items']>[number];

/**
 * 내비는 데스크톱에서 한 줄을 넘지 않는다. 한 줄에 다 들어가지 않는 폭(1200px 미만)에서는
 * 가로 메뉴를 쓰지 않고 오른쪽 서랍으로 옮긴다(theme.ts 의 hasFullNav). antd 의 넘침 메뉴(...)는
 * 묶음 칸을 한 번 더 옆으로 띄우는데, 휴대폰 폭에서는 그 칸이 화면 밖으로 밀려 글자가 잘렸다.
 *
 * 메뉴 구조는 app/navigation.tsx 의 표 하나가 원본이다. 여기서는 그 표를 antd 메뉴 항목으로 바꾸기만 한다.
 * 묶음 칸 자체는 화면이 없어 누르면 펼쳐지기만 하고, 펼친 목록 안의 소제목은 group 항목으로 그린다.
 *
 * 가로 메뉴의 첫 줄 칸에는 아이콘을 두지 않는다. 칸이 일곱이 되자 1200~1439px(흔한 노트북 폭)에서 끝의 계산기와
 * 시뮬레이터가 넘침 메뉴(...)로 숨었다. 아이콘은 칸마다 24px 를 차지한다. 펼친 목록, 서랍, 전체 검색에는 둔다.
 */
function toMenuItem(entry: NavEntry): MenuItem {
  if (!isNavGroup(entry)) return leafItem(entry, false);
  return {
    key: entry.key,
    label: entry.label,
    children: entry.sections.flatMap((section, position): MenuItem[] => {
      const items = section.items.map((leaf) => leafItem(leaf));
      const body: MenuItem[] = section.title
        ? [
            {
              key: `${entry.key}:${section.title}`,
              type: 'group',
              label: section.title,
              children: items,
            },
          ]
        : items;
      return position === 0
        ? body
        : [{ key: `${entry.key}:divider:${position}`, type: 'divider' }, ...body];
    }),
  };
}

function leafItem(leaf: NavLeaf, withIcon = true): MenuItem {
  return {
    key: leaf.path,
    icon: withIcon ? leaf.icon : undefined,
    label: <NavLink to={leaf.path}>{leaf.label}</NavLink>,
  };
}

/** 서랍 메뉴의 소제목. 항목과 글씨 크기와 색으로 갈라 한눈에 제목인 줄 알게 한다. */
function drawerHeading(text: string): ReactNode {
  return <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.2 }}>{text}</span>;
}

/**
 * 서랍 메뉴. 묶음을 접지 않고 펼쳐 두되, 안쪽 구분마다 제목 하나만 단다. "시뮬레이터" 제목 바로 아래에 "장비"
 * 제목이 또 나오면 두 줄이 연달아 서서 무엇이 무엇의 제목인지 알 수 없었다. 그래서 "시뮬레이터 · 장비" 처럼
 * 위 분류를 제목에 붙이고 하나로 세운다. 묶음마다 앞뒤를 가르는 선을 두어 뒤따르는 최상위 칸(뿔피리)이 앞 묶음의
 * 항목처럼 보이지 않게 한다.
 */
function toDrawerItems(entries: NavEntry[]): MenuItem[] {
  const items: MenuItem[] = [];
  const divider = (key: string): MenuItem => ({ key, type: 'divider' });
  entries.forEach((entry, position) => {
    if (!isNavGroup(entry)) {
      // 묶음 뒤에 오는 최상위 칸은 선으로 갈라 묶음의 마지막 항목처럼 보이지 않게 한다.
      if (position > 0 && isNavGroup(entries[position - 1]))
        items.push(divider(`divider:after:${entry.path}`));
      items.push(leafItem(entry));
      return;
    }
    if (items.length > 0) items.push(divider(`divider:before:${entry.key}`));
    entry.sections.forEach((section, index) => {
      const title = [entry.label, section.title].filter(Boolean).join(' · ');
      if (index > 0) items.push(divider(`divider:${entry.key}:${index}`));
      items.push({
        key: `${entry.key}:${section.title ?? index}`,
        type: 'group',
        label: drawerHeading(title),
        children: section.items.map((leaf) => leafItem(leaf)),
      });
    });
  });
  return items;
}

/**
 * 헤더의 검색 단추. 아주 넓은 화면(1600px 이상)에서는 "검색" 과 단축키를 함께 적는다. 그보다 좁으면 아이콘만 두어
 * 가로 메뉴가 한 줄에 들 자리를 남기고, 가로 메뉴가 있는 폭에서는 단축키를 툴팁으로 알린다.
 */
function SearchButton({
  onOpen,
  size,
}: {
  onOpen: () => void;
  size: 'full' | 'icon' | 'iconWithHint';
}) {
  if (size !== 'full') {
    const button = (
      <Button type="text" aria-label="전체 검색 열기" icon={<SearchIcon />} onClick={onOpen} />
    );
    return size === 'iconWithHint' ? (
      <Tooltip title={`전체 검색 (${searchShortcutLabel()})`}>{button}</Tooltip>
    ) : (
      button
    );
  }
  return (
    <Button icon={<SearchIcon />} onClick={onOpen}>
      검색
      <Text keyboard style={{ marginInlineStart: 8, fontSize: 12 }}>
        {searchShortcutLabel()}
      </Text>
    </Button>
  );
}

/**
 * 조회를 할 수 없을 때만 알린다. 프록시를 거치는 것은 방문자 대부분이 늘 보는 기본 상태이고, 개발할 때 쓰는 내 API 키도
 * 알려 줄 것이 없어서 둘 다 아무것도 그리지 않는다. 설정 화면이 없으므로 키를 직접 넣는 경로는 없다.
 */
function EndpointTag() {
  const endpoint = useEndpointMode();

  if (endpoint.apiKey || endpoint.viaProxy) return null;
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
  // 방문자 PC 시계가 틀려도 에린 시각이 맞게 보이도록 서버 시계와의 차이를 재 둔다.
  useServerClockSync();

  // 복원 시뮬레이터의 시세 파일은 작다. 첫 화면을 다 그린 뒤 미리 받아 두면 시뮬레이터를
  // 처음 여는 사람도 나온 유물의 시세를 기다리지 않는다.
  const queryClient = useQueryClient();
  useEffect(() => {
    const timer = window.setTimeout(() => prefetchRelicPrices(queryClient), 1500);
    return () => window.clearTimeout(timer);
  }, [queryClient]);

  const navEntries: NavEntry[] = hasAdminKey ? [...NAV_TREE, ADMIN_NAV_ITEM] : NAV_TREE;
  const navItems = navEntries.map(toMenuItem);
  const selectedPath = selectedPathFor(location.pathname, [...NAV_TREE, ADMIN_NAV_ITEM]);
  const selectedKeys = selectedPath ? [selectedPath] : [];
  // 1200px 미만은 가로 메뉴가 한 줄에 다 들어가지 않는다. 서랍으로 옮긴다.
  const compactNav = !hasFullNav(screens);
  const headerHeight = headerHeightFor(screens);

  const navigate = useNavigate();
  useEffect(() => {
    const onFailure = () =>
      navigate('/data-error', {
        replace: true,
        state: { returnTo: location.pathname + location.search + location.hash },
      });
    window.addEventListener(GAME_DATA_FAILURE_EVENT, onFailure);
    return () => window.removeEventListener(GAME_DATA_FAILURE_EVENT, onFailure);
  }, [navigate, location.pathname, location.search, location.hash]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const toggleSearch = useCallback(() => setSearchOpen((open) => !open), []);
  useSearchShortcut(toggleSearch);
  // 화면을 옮기면 서랍은 닫힌다. 뒤로 가기로 옮겨 가도 닫혀야 해서 경로를 본다.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  /**
   * 메뉴 칸의 글자만 링크다. 글자 옆 빈 곳을 눌러도 옮겨 가게 한다. 링크를 눌렀을 때는
   * 링크가 이미 옮겼으므로 한 번 더 옮기지 않는다(뒤로 가기가 두 번 걸린다).
   */
  const handleMenuClick: MenuProps['onClick'] = ({ key, domEvent }) => {
    if ((domEvent.target as Element).closest('a')) return;
    if (key.startsWith('/')) navigate(key);
  };

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
    // 100dvh 를 쓰지 않고 부모에서 늘어난다. 까닭은 styles/index.css 의 body 주석에 있다.
    <Layout style={{ flex: '1 0 auto', background: token.colorBgLayout }}>
      <Header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          height: headerHeight,
          lineHeight: `${headerHeight}px`,
          borderBottom: `1px solid ${token.colorBorder}`,
          background: token.colorBgContainer,
          // 본문이 헤더 밑으로 지나갈 때 경계가 분명해야 한다. 배경색 계열로만 옅게 깐다.
          boxShadow: token.boxShadowTertiary,
        }}
      >
        {/* Header 가 물려주는 line-height 를 여기서 끊는다. 배지와 글자가 세로로 늘어난다. */}
        <Flex
          align="center"
          gap={screens.md ? 28 : 12}
          style={{ ...containerStyle, height: '100%', lineHeight: 'normal' }}
        >
          <Link to="/" aria-label="마비쿠마 홈">
            <Space size={8}>
              {/* 원본은 2배 크기로 담았다. 너비와 높이를 적어 두어야 그림이 늦게 떠도 글자가 밀리지 않는다. */}
              <img
                src={isDark ? logoMarkDark : logoMark}
                alt=""
                width={34}
                height={40}
                style={{ display: 'block' }}
              />
              {/*
                로고 글자도 그림이다. 진한 갈색 글자는 어두운 배경에 묻혀서, 다크 모드에서는
                글자 속만 밝게 칠한 판을 쓴다. 외곽선은 짙게 남겨야 글자끼리 붙어 보이지 않는다.
                라이트 판도 같은 이유로 '마비' 속을 외곽선보다 한참 밝은 캐러멜색으로 둔다(대비 약 3.9:1).
                곰은 다크 모드에서 크림색 테두리를 두른 판을 쓴다.
                글자가 그림이라 alt 에 이름을 적는다. 구글은 첫 화면의 글자로도 사이트 이름을 가늠한다.
              */}
              <img
                src={isDark ? wordmarkDark : wordmark}
                alt="마비쿠마"
                width={102}
                height={28}
                style={{ display: 'block' }}
              />
            </Space>
          </Link>

          {compactNav ? (
            <div style={{ flex: 1 }} />
          ) : (
            <nav aria-label="주요 메뉴" style={{ flex: 1, minWidth: 0 }}>
              <Menu
                mode="horizontal"
                items={navItems}
                selectedKeys={selectedKeys}
                onClick={handleMenuClick}
                style={{
                  borderBottom: 'none',
                  background: 'transparent',
                  lineHeight: `${HEADER_HEIGHT}px`,
                }}
              />
            </nav>
          )}

          <Space size={4}>
            {screens.sm ? <EndpointTag /> : null}
            {/* 검색 단추 왼쪽. 좁은 화면은 헤더에 자리가 없어 서랍 맨 위에 둔다. */}
            {compactNav ? null : <ErinnClockButton />}
            <SearchButton
              onOpen={() => setSearchOpen(true)}
              size={compactNav ? 'icon' : screens.xxl ? 'full' : 'iconWithHint'}
            />
            <ThemeToggle />
            {/* 좁은 화면은 헤더가 좁아 설정을 메뉴 서랍 안에 둔다. */}
            {compactNav ? null : <SettingsButton />}
            {compactNav ? null : <IssueReportTrigger variant="icon" />}
            {compactNav ? (
              <Button
                type="text"
                aria-label="메뉴 열기"
                aria-expanded={drawerOpen}
                icon={<MenuIcon />}
                onClick={() => setDrawerOpen(true)}
              />
            ) : null}
          </Space>
        </Flex>
      </Header>

      {compactNav ? (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          placement="right"
          size={280}
          title="메뉴"
          styles={{ body: { padding: 8 } }}
        >
          <div style={{ padding: '8px 16px 12px' }}>
            <ErinnClockDetail />
          </div>
          <nav aria-label="주요 메뉴">
            <Menu
              mode="inline"
              items={toDrawerItems(navEntries)}
              selectedKeys={selectedKeys}
              onClick={handleMenuClick}
              style={{ borderInlineEnd: 'none', background: 'transparent' }}
            />
          </nav>
          <Flex vertical gap={12} style={{ padding: '12px 16px' }}>
            <Text strong style={{ fontSize: 15 }}>
              설정
            </Text>
            <SettingsPanel />
            <IssueReportTrigger variant="text" />
          </Flex>
          {/* 좁은 화면은 헤더에 조회 상태 배지를 둘 자리가 없다. 서랍 아래에 옮겨 둔다. */}
          {screens.sm ? null : (
            <div style={{ padding: '12px 16px' }}>
              <EndpointTag />
            </div>
          )}
        </Drawer>
      ) : null}

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} entries={navEntries} />

      <Content style={{ ...containerStyle, paddingBlock: screens.md ? 32 : 20 }}>
        {/* 나눠 받는 화면을 받는 동안 푸터가 화면 안으로 올라오지 않게 한 화면 높이를 비워 둔다. */}
        <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
          <Outlet />
        </Suspense>
      </Content>

      {/*
        푸터는 읽히려고 있는 자리가 아니라 고지를 지키려고 있는 자리다. 한 줄로 줄이고
        글자도 작게 둔다. 지연 고지와 비공식 고지는 지우지 않는다.
      */}
      <Footer
        style={{
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          textAlign: 'center',
          paddingBlockStart: 12,
          paddingBlockEnd: 12,
          paddingInline: 16,
        }}
      >
        <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.6 }}>
          {/* 로고는 그림뿐이라 사이트 이름이 글자로 적힌 곳이 여기다. 검색엔진이 이름을 읽는 자리다. */}
          마비쿠마(MabiKuma) · 데이터 출처{' '}
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
          {' · '}
          <IssueReportTrigger variant="link" />
        </Text>
      </Footer>

      {/* 어느 화면에서든 제보할 수 있어야 한다. 창은 여기 한 번만 두고, 여는 단추는 헤더와 푸터에 있다. */}
      <IssueReportModal />
    </Layout>
  );
}
