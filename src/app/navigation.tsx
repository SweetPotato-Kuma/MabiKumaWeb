import type { ReactNode } from 'react';
import { ITEM_PATH_PREFIX } from '@/features/auction/dictionary';
import { CALCULATORS, calculatorPath } from '@/features/calculators/registry';
import {
  AuctionIcon,
  BagIcon,
  BookIcon,
  CalculateIcon,
  DiceIcon,
  HammerIcon,
  HexagonIcon,
  HornIcon,
  ImageIcon,
  MuseumIcon,
  PaidIcon,
  ShopIcon,
  TicketIcon,
  TollIcon,
  TrendingUpIcon,
  WaterDropIcon,
} from '@/components/icons';

/**
 * 메뉴 구조의 원본. 헤더 메뉴, 서랍 메뉴, 전체 검색(Ctrl+K)이 모두 이 표 하나를 읽는다.
 * 화면을 하나 더하면 여기에 한 줄만 적는다. 화면마다 따로 적으면 메뉴에는 있는데 검색에는
 * 없는 화면이 조용히 생긴다.
 *
 * 대분류(NavGroup)는 눌러도 화면이 없고 펼쳐지기만 한다. 중분류(NavSection)는 펼친 목록 안의 소제목이다.
 */
export interface NavLeaf {
  path: string;
  label: string;
  icon: ReactNode;
  /** 이 경로 아래(또는 같은 화면으로 보는 다른 경로)에서도 이 칸이 선택된 것으로 본다. */
  alsoMatches?: string[];
  /** 검색에서만 쓰는 다른 이름. 화면에는 보이지 않는다. */
  keywords?: string;
}

export interface NavSection {
  title?: string;
  items: NavLeaf[];
}

export interface NavGroup {
  key: string;
  label: string;
  icon: ReactNode;
  sections: NavSection[];
}

export type NavEntry = NavLeaf | NavGroup;

export const isNavGroup = (entry: NavEntry): entry is NavGroup => 'sections' in entry;

/**
 * 사용자가 직접 해 보는 것(세공, 성수, 주화, 오검 워드, 유물 복원)은 시뮬레이터 아래로 모은다. 주화는 토템 장비라
 * 장비에 두고, 오검 워드는 아르카나에 끼우는 것이라 따로 둔다. 주화는 던전을, 유물 복원은 무리아스와 탈라 가흐를
 * 그 화면 안의 탭으로 가르므로 메뉴에는 한 칸씩이다. 순서는 게임에 먼저 나온 것부터다.
 * 유물 시세는 매물을 읽는 화면이라 경매장 곁에 두고, 탈라 가흐 유물도 그 화면의 탭으로 들어간다.
 * 던전 코인은 코인으로 NPC 상점에서 살 수 있는 것의 값을 따지는 화면이라 NPC 상점 아래에 둔다.
 */
export const NAV_TREE: NavEntry[] = [
  { path: '/auction', label: '경매장', icon: <AuctionIcon />, keywords: '시세 가격 매물' },
  {
    path: '/items',
    label: '아이템 정보',
    icon: <BookIcon />,
    alsoMatches: [ITEM_PATH_PREFIX],
    keywords: '사전 제작 레시피 장비 도감',
  },
  { path: '/relics', label: '유물 시세', icon: <TrendingUpIcon />, keywords: '무리아스 이데아 탈라가흐' },
  {
    key: 'npc-shop',
    label: 'NPC 상점',
    icon: <ShopIcon />,
    sections: [
      {
        items: [
          { path: '/dungeon-coins', label: '던전 코인', icon: <TollIcon />, keywords: '코인 가치 교환' },
          { path: '/bags', label: '튼튼한 주머니', icon: <BagIcon />, keywords: '주머니 염색' },
          { path: '/magmell-pass', label: '마그 멜 통행증', icon: <TicketIcon />, keywords: '통행증 마그멜' },
        ],
      },
    ],
  },
  { path: '/horn', label: '뿔피리', icon: <HornIcon />, keywords: '거대한 외침 확성기 서버' },
  {
    key: 'calculators',
    label: '계산기',
    icon: <CalculateIcon />,
    sections: [
      {
        items: [
          ...CALCULATORS.map((calculator) => ({
            path: calculatorPath(calculator.id),
            label: calculator.title,
            icon: <CalculateIcon />,
            keywords: '계산 계산기',
          })),
        ],
      },
    ],
  },
  {
    key: 'simulator',
    label: '시뮬레이터',
    icon: <DiceIcon />,
    sections: [
      {
        title: '장비',
        items: [
          { path: '/reforge-simulator', label: '세공', icon: <HammerIcon />, keywords: '시뮬레이터 세공 도구' },
          { path: '/holy-water-simulator', label: '성수', icon: <WaterDropIcon />, keywords: '무리아스 시뮬레이터' },
          { path: '/coin-simulator', label: '주화', icon: <PaidIcon />, keywords: '브리레흐 브리 레흐 토템 잔흔석 시뮬레이터' },
        ],
      },
      {
        title: '아르카나',
        items: [
          { path: '/ogham-simulator', label: '오검 워드', icon: <HexagonIcon />, keywords: '오검 룬 조합 재설정 시뮬레이터' },
        ],
      },
      {
        title: '유물',
        items: [
          { path: '/relic-simulator', label: '유물 복원', icon: <MuseumIcon />, keywords: '무리아스 탈라가흐 이데아 시뮬레이터' },
        ],
      },
    ],
  },
];

/**
 * 운영자 작업 화면. 키를 넣어 둔 브라우저에서만 메뉴에 걸린다.
 * 메뉴에 없다고 못 들어가는 것은 아니다. 주소를 치면 화면은 열리고 키를 묻는다.
 */
export const ADMIN_NAV_ITEM: NavLeaf = { path: '/item-card', label: '카드 만들기', icon: <ImageIcon /> };

/** 화면이 있는 칸 전부. 어느 대분류와 소제목 아래 있는지를 trail 로 함께 준다. */
export interface NavPage {
  leaf: NavLeaf;
  /** "시뮬레이터, 장비" 처럼 위 분류. 최상위 칸이면 빈 문자열. */
  trail: string;
}

export function navPages(entries: NavEntry[]): NavPage[] {
  return entries.flatMap((entry): NavPage[] => {
    if (!isNavGroup(entry)) return [{ leaf: entry, trail: '' }];
    return entry.sections.flatMap((section) =>
      section.items.map((leaf) => ({
        leaf,
        trail: [entry.label, section.title].filter(Boolean).join(', '),
      })),
    );
  });
}

/**
 * 현재 경로에 해당하는 칸의 경로.
 * 어느 칸에도 맞지 않으면(첫 화면, 없는 주소의 404 화면 등) 빈 글자다. 그때 아무 메뉴도 선택되어 있으면 안 된다.
 */
export function selectedPathFor(pathname: string, entries: NavEntry[]): string {
  if (pathname === '/') return '';
  const match = navPages(entries).find(({ leaf }) =>
    [leaf.path, ...(leaf.alsoMatches ?? [])].some((prefix) => pathname.startsWith(prefix)),
  );
  return match ? match.leaf.path : '';
}
