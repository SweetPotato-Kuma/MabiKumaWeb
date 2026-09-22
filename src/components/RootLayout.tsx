import { NavLink, Outlet } from 'react-router-dom';
import { useEndpointMode } from '@/lib/settings';

const NAV_ITEMS = [
  { to: '/', label: '홈', end: true },
  { to: '/auction', label: '경매장', end: false },
  { to: '/npc-shop', label: 'NPC 상점', end: false },
  { to: '/settings', label: '설정', end: false },
] as const;

export function RootLayout() {
  const endpoint = useEndpointMode();
  const mode = endpoint.apiKey ? 'key' : endpoint.viaProxy ? 'proxy' : 'none';

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <NavLink to="/" className="brand">
            <span className="brand__mark" aria-hidden="true">
              🐻
            </span>
            <span className="brand__text">MabiKuma</span>
          </NavLink>

          <nav aria-label="주요 메뉴">
            <ul className="nav">
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => (isActive ? 'nav__link is-active' : 'nav__link')}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <span className={mode === 'none' ? 'key-chip is-warn' : 'key-chip is-ok'}>
            {mode === 'key' ? '내 API 키' : mode === 'proxy' ? '프록시 경유' : 'API 키 없음'}
          </span>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <footer className="app-footer">
        <p>
          데이터 출처:{' '}
          <a href="https://openapi.nexon.com/ko/game/mabinogi/" target="_blank" rel="noreferrer">
            NEXON Open API
          </a>{' '}
          · 게임 데이터는 평균 10분 지연됩니다.
        </p>
        <p className="app-footer__muted">
          이 사이트는 개인이 만든 비공식 도구이며 넥슨과 무관합니다.
        </p>
      </footer>
    </div>
  );
}
