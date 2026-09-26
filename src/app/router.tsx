import { Navigate, createBrowserRouter } from 'react-router-dom';
import pageMeta from '@/app/pageMeta.json';
import { RootLayout } from '@/components/RootLayout';
import { RouteErrorPage } from '@/pages/RouteErrorPage';
import { AuctionPage } from '@/pages/AuctionPage';
import { ItemsPage } from '@/pages/ItemsPage';
import { LegacyRedirect } from '@/pages/LegacyRedirect';
import { BagsPage } from '@/pages/BagsPage';
import { MagmellPassPage } from '@/pages/MagmellPassPage';
import { DungeonCoinsPage } from '@/pages/DungeonCoinsPage';
import { RelicsPage } from '@/pages/RelicsPage';
import { ItemCardPage } from '@/pages/ItemCardPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PrivacyPage } from '@/pages/PrivacyPage';

/**
 * 아이템 카드 만들기는 운영자 작업 화면이지만 배포본에도 올라간다. 게임을 하는 컴퓨터에서
 * 바로 찍어 넣으려면 배포된 주소에서 열려야 하기 때문이다.
 *
 * 정적 번들에는 화면을 숨길 방법이 없다. 그래서 길은 열어 두고, 운영자 키가 없으면
 * 화면이 키 입력칸 하나만 보여 준다. 진짜 잠금은 워커의 쓰기 경로에 걸려 있다.
 */
const ADMIN_ROUTES = [{ path: 'item-card', element: <ItemCardPage /> }];

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <RootLayout />,
      errorElement: <RouteErrorPage />,
      children: [
        // 방문자가 하려는 일은 시세 조회다. 소개 화면을 거치게 할 이유가 없다.
        { index: true, element: <Navigate to="/auction" replace /> },
        { path: 'auction', element: <AuctionPage /> },
        { path: 'items', element: <ItemsPage /> },
        // 옮겨 간 화면의 예전 주소. 빌드가 같은 목록으로 검색엔진용 HTML 을 굽는다.
        ...pageMeta.redirects.map((redirect) => ({
          path: redirect.from.slice(1),
          element: <LegacyRedirect to={redirect.to} />,
        })),
        // 예전 NPC 상점 화면 주소. 그 자리는 NPC 상점 메뉴의 첫 항목인 주머니 찾기가 이어받는다.
        { path: 'npc-shop', element: <Navigate to="/bags" replace /> },
        { path: 'bags', element: <BagsPage /> },
        { path: 'magmell-pass', element: <MagmellPassPage /> },
        { path: 'dungeon-coins', element: <DungeonCoinsPage /> },
        { path: 'relics', element: <RelicsPage /> },
        { path: 'privacy', element: <PrivacyPage /> },
        ...ADMIN_ROUTES,
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  // GitHub Pages 프로젝트 사이트는 /<repo>/ 하위에서 돌아가므로 Vite 의 base 를 그대로 쓴다.
  { basename: import.meta.env.BASE_URL },
);
