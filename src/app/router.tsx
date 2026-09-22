import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from '@/components/RootLayout';
import { RouteErrorPage } from '@/pages/RouteErrorPage';
import { HomePage } from '@/pages/HomePage';
import { AuctionPage } from '@/pages/AuctionPage';
import { DictionaryPage } from '@/pages/DictionaryPage';
import { NpcShopPage } from '@/pages/NpcShopPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <RootLayout />,
      errorElement: <RouteErrorPage />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'auction', element: <AuctionPage /> },
        { path: 'dictionary', element: <DictionaryPage /> },
        { path: 'npc-shop', element: <NpcShopPage /> },
        { path: 'settings', element: <SettingsPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  // GitHub Pages 프로젝트 사이트는 /<repo>/ 하위에서 돌아가므로 Vite 의 base 를 그대로 쓴다.
  { basename: import.meta.env.BASE_URL },
);
