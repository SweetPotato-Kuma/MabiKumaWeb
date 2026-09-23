import { Navigate, createBrowserRouter } from 'react-router-dom';
import { RootLayout } from '@/components/RootLayout';
import { RouteErrorPage } from '@/pages/RouteErrorPage';
import { AuctionPage } from '@/pages/AuctionPage';
import { DictionaryPage } from '@/pages/DictionaryPage';
import { NpcShopPage } from '@/pages/NpcShopPage';
import { ItemCardPage } from '@/pages/ItemCardPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

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
        { path: 'dictionary', element: <DictionaryPage /> },
        { path: 'npc-shop', element: <NpcShopPage /> },
        ...ADMIN_ROUTES,
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  // GitHub Pages 프로젝트 사이트는 /<repo>/ 하위에서 돌아가므로 Vite 의 base 를 그대로 쓴다.
  { basename: import.meta.env.BASE_URL },
);
