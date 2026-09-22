import { Navigate, createBrowserRouter } from 'react-router-dom';
import { RootLayout } from '@/components/RootLayout';
import { RouteErrorPage } from '@/pages/RouteErrorPage';
import { AuctionPage } from '@/pages/AuctionPage';
import { DictionaryPage } from '@/pages/DictionaryPage';
import { NpcShopPage } from '@/pages/NpcShopPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

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
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  // GitHub Pages 프로젝트 사이트는 /<repo>/ 하위에서 돌아가므로 Vite 의 base 를 그대로 쓴다.
  { basename: import.meta.env.BASE_URL },
);
