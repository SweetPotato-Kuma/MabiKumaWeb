import type { ReactNode } from 'react';
import { ITEM_PATH_PREFIX } from '@/features/auction/dictionary';
import {
  AuctionIcon,
  BagIcon,
  BookIcon,
  DiceIcon,
  HammerIcon,
  HornIcon,
  ImageIcon,
  MuseumIcon,
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
 * 유물은 무리아스에 묶이지 않는다. 탈라 가흐 유물이나 잔흔석 같은 재화가 나와도 이 칸 아래로 들어오게
 * 따로 둔다. 시뮬레이터는 "장비" 소제목 아래에 세공과 성수를 둔다. 순서는 게임에 먼저 나온 것부터다.
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
  { path: '/dungeon-coins', label: '던전 코인', icon: <TollIcon />, keywords: '코인 가치 교환' },
  {
    key: 'relic',
    label: '유물',
    icon: <MuseumIcon />,
    sections: [
      {
        items: [
          { path: '/relics', label: '유물 시세', icon: <TrendingUpIcon />, keywords: '무리아스 이데아' },
          { path: '/relic-simulator', label: '유물 복원', icon: <MuseumIcon />, keywords: '무리아스 이데아 시뮬레이터' },
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
        ],
      },
    ],
  },
  {
    key: 'find',
    label: '찾기',
    icon: <ShopIcon />,
    sections: [
      {
        title: 'NPC 상점',
        items: [
          { path: '/bags', label: '튼튼한 주머니', icon: <BagIcon />, keywords: '주머니 염색' },
          { path: '/magmell-pass', label: '마그 멜 통행증', icon: <TicketIcon />, keywords: '통행증 마그멜' },
        ],
      },
      {
        title: '서버',
        items: [{ path: '/horn', label: '뿔피리', icon: <HornIcon />, keywords: '거대한 외침 확성기' }],
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

/** 현재 경로에 해당하는 칸의 경로. 루트로 들어오면 경매장이 첫 화면이다. */
export function selectedPathFor(pathname: string, entries: NavEntry[]): string {
  const match = navPages(entries).find(({ leaf }) =>
    [leaf.path, ...(leaf.alsoMatches ?? [])].some((prefix) => pathname.startsWith(prefix)),
  );
  return match ? match.leaf.path : '/auction';
}
