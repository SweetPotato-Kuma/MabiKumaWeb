import { lazy, type ComponentType } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import pageMeta from '@/app/pageMeta.json';
import { ITEM_PATH_PREFIX } from '@/features/auction/dictionary';
import { CALCULATORS, calculatorPath } from '@/features/calculators/registry';
import { RootLayout } from '@/components/RootLayout';
import { RouteErrorPage } from '@/pages/RouteErrorPage';
import { AuctionPage } from '@/pages/AuctionPage';
import { HomePage } from '@/pages/HomePage';
import { ItemsPage } from '@/pages/ItemsPage';
import { LegacyRedirect } from '@/pages/LegacyRedirect';

/**
 * 검색으로 바로 들어오는 경매장과 아이템 정보는 첫 번들에 두고, 나머지 화면은 열 때 받는다.
 * 첫 방문자가 쓰지 않는 화면의 코드를 같이 받지 않게 하려는 것이다. 받는 동안은 RootLayout 의 Suspense 가 받는다.
 */
const lazyPage = <Name extends string>(
  load: () => Promise<Record<Name, ComponentType>>,
  name: Name,
) => lazy(async () => ({ default: (await load())[name] }));

const BagsPage = lazyPage(() => import('@/pages/BagsPage'), 'BagsPage');
const MagmellPassPage = lazyPage(() => import('@/pages/MagmellPassPage'), 'MagmellPassPage');
const HornPage = lazyPage(() => import('@/pages/HornPage'), 'HornPage');
const DungeonCoinsPage = lazyPage(() => import('@/pages/DungeonCoinsPage'), 'DungeonCoinsPage');
const RelicsPage = lazyPage(() => import('@/pages/RelicsPage'), 'RelicsPage');
const RelicSimulatorPage = lazyPage(() => import('@/pages/RelicSimulatorPage'), 'RelicSimulatorPage');
const ReforgeSimulatorPage = lazyPage(() => import('@/pages/ReforgeSimulatorPage'), 'ReforgeSimulatorPage');
const HolyWaterSimulatorPage = lazyPage(() => import('@/pages/HolyWaterSimulatorPage'), 'HolyWaterSimulatorPage');
const OghamSimulatorPage = lazyPage(() => import('@/pages/OghamSimulatorPage'), 'OghamSimulatorPage');
const EchostoneSimulatorPage = lazyPage(() => import('@/pages/EchostoneSimulatorPage'), 'EchostoneSimulatorPage');
const CoinSimulatorPage = lazyPage(() => import('@/pages/CoinSimulatorPage'), 'CoinSimulatorPage');
const CalculatorListPage = lazyPage(() => import('@/pages/CalculatorPages'), 'CalculatorListPage');
// 계산기 화면은 id 를 받으므로 lazyPage(속성 없는 화면)를 쓰지 않는다.
const CalculatorPage = lazy(async () => ({ default: (await import('@/pages/CalculatorPages')).CalculatorPage }));
const ItemCardPage = lazyPage(() => import('@/pages/ItemCardPage'), 'ItemCardPage');
const NotFoundPage = lazyPage(() => import('@/pages/NotFoundPage'), 'NotFoundPage');
const PrivacyPage = lazyPage(() => import('@/pages/PrivacyPage'), 'PrivacyPage');

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
        // 루트는 제 자리에서 화면을 그린다. 다른 곳으로 넘기면 구글이 첫 화면을 수집하지 않는다(HomePage).
        { index: true, element: <HomePage /> },
        { path: 'auction', element: <AuctionPage /> },
        /**
         * 목록(/items)과 아이템 한 장(/item/<slug>)이 한 화면을 나눠 쓴다. 두 경로를 한 부모 아래
         * 두어야 목록과 상세를 오갈 때 화면이 새로 그려지지 않는다. 상세를 보는 동안 숨겨 둔 목록의
         * 검색어와 보던 쪽이 그 안에 들어 있다.
         */
        {
          element: <ItemsPage />,
          children: [{ path: 'items' }, { path: `${ITEM_PATH_PREFIX.slice(1)}:slug` }],
        },
        // 옮겨 간 화면의 예전 주소. 빌드가 같은 목록으로 검색엔진용 HTML 을 굽는다.
        ...pageMeta.redirects.map((redirect) => ({
          path: redirect.from.slice(1),
          element: <LegacyRedirect to={redirect.to} />,
        })),
        // 예전 NPC 상점 화면 주소. 그 자리는 NPC 상점 메뉴의 첫 항목인 주머니 찾기가 이어받는다.
        { path: 'npc-shop', element: <Navigate to="/bags" replace /> },
        { path: 'bags', element: <BagsPage /> },
        { path: 'magmell-pass', element: <MagmellPassPage /> },
        { path: 'horn', element: <HornPage /> },
        { path: 'dungeon-coins', element: <DungeonCoinsPage /> },
        { path: 'relics', element: <RelicsPage /> },
        { path: 'calculators', element: <CalculatorListPage /> },
        // 계산기마다 자기 경로가 있다(빌드가 경로마다 HTML 을 굽는다). 계산기를 더하면 이 줄이 저절로 늘어난다.
        ...CALCULATORS.map((calculator) => ({
          path: calculatorPath(calculator.id).slice(1),
          element: <CalculatorPage id={calculator.id} />,
        })),
        { path: 'relic-simulator', element: <RelicSimulatorPage /> },
        { path: 'reforge-simulator', element: <ReforgeSimulatorPage /> },
        { path: 'holy-water-simulator', element: <HolyWaterSimulatorPage /> },
        { path: 'ogham-simulator', element: <OghamSimulatorPage /> },
        { path: 'coin-simulator', element: <CoinSimulatorPage /> },
        { path: 'echostone-simulator', element: <EchostoneSimulatorPage /> },
        { path: 'privacy', element: <PrivacyPage /> },
        ...ADMIN_ROUTES,
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  // GitHub Pages 프로젝트 사이트는 /<repo>/ 하위에서 돌아가므로 Vite 의 base 를 그대로 쓴다.
  { basename: import.meta.env.BASE_URL },
);
