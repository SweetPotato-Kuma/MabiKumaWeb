import { Link } from 'react-router-dom';
import { useCanQuery } from '@/lib/settings';

const FEATURES = [
  {
    to: '/auction',
    title: '경매장 조회',
    body: '카테고리·아이템 이름·키워드로 현재 매물을 찾고, 개당 가격의 최저/중위/평균을 한눈에 봅니다. 최근 1시간 거래 내역도 함께 확인할 수 있습니다.',
  },
  {
    to: '/npc-shop',
    title: 'NPC 상점 조회',
    body: '서버·채널·NPC 를 골라 상점 탭별 판매 목록과 가격, 구매 제한, 다음 갱신 시각을 확인합니다.',
  },
  {
    to: '/settings',
    title: '설정',
    body: '자기 API 키를 쓰거나 프록시 주소를 바꿉니다. 값은 이 브라우저에만 저장됩니다.',
  },
] as const;

export function HomePage() {
  const canQuery = useCanQuery();

  return (
    <div className="page">
      <section className="hero">
        <h1>마비노기 도구상자</h1>
        <p>
          넥슨 오픈 API 를 붙여 만든 정적 웹 도구입니다. API 키는 프록시 워커가 들고 있어
          브라우저로 내려오지 않습니다. 자기 키를 쓰고 싶으면 설정에서 넣으면 됩니다.
        </p>
        <Link className="button button--primary" to={canQuery ? '/auction' : '/settings'}>
          {canQuery ? '경매장 조회 시작' : '먼저 API 키 등록하기'}
        </Link>
      </section>

      <section className="card-grid">
        {FEATURES.map((feature) => (
          <Link key={feature.to} to={feature.to} className="card">
            <h2>{feature.title}</h2>
            <p>{feature.body}</p>
          </Link>
        ))}
      </section>

      <section className="panel">
        <h2>API 키 발급 방법</h2>
        <ol className="steps">
          <li>
            <a href="https://openapi.nexon.com/" target="_blank" rel="noreferrer">
              NEXON Open API
            </a>{' '}
            에 넥슨 계정으로 로그인합니다.
          </li>
          <li>&apos;내 애플리케이션&apos; 메뉴에서 애플리케이션을 등록합니다.</li>
          <li>발급된 API Key 를 복사해 이 사이트의 설정 화면에 붙여넣습니다.</li>
        </ol>
      </section>
    </div>
  );
}
