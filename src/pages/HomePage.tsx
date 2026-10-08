import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Card, Col, Flex, Grid, Row, Skeleton, Typography, theme } from 'antd';
import { NAV_TREE, navPages } from '@/app/navigation';
import { EmptyState } from '@/components/EmptyState';
import { ChevronRightIcon } from '@/components/icons';
import { EventBanners } from '@/components/news/EventBanners';
import { NewsPostList } from '@/components/news/NewsPostList';
import { canReadNews, useNewsList } from '@/features/news/api';

const { Title, Text } = Typography;

/** 첫 화면에 보이는 최근 새소식 수. */
const LATEST_NEWS = 6;

function Section({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Flex vertical gap={12}>
      <Flex justify="space-between" align="baseline" gap={12}>
        <Title level={5} style={{ margin: 0 }}>
          {title}
        </Title>
        {extra}
      </Flex>
      {children}
    </Flex>
  );
}

function LatestNews({ wide }: { wide: boolean }) {
  const query = useNewsList({ category: '', q: '', edited: false, page: 1 });
  if (query.error) {
    return (
      <Alert
        type="error"
        showIcon
        message={query.error instanceof Error ? query.error.message : '새소식을 받지 못했습니다.'}
      />
    );
  }
  if (query.isLoading || !query.data) {
    return (
      <Card size="small" aria-busy="true" aria-live="polite">
        <Skeleton active title={false} paragraph={{ rows: LATEST_NEWS, width: '100%' }} />
      </Card>
    );
  }
  const posts = query.data.posts.slice(0, LATEST_NEWS);
  if (posts.length === 0)
    return <EmptyState size="small" description="아직 받아 둔 새소식이 없습니다." />;
  return (
    <Card size="small" styles={{ body: { paddingBlock: 0 } }}>
      <NewsPostList posts={posts} wide={wide} />
    </Card>
  );
}

/**
 * 첫 화면. 사이트 이름, 공식 홈페이지의 진행 중인 이벤트와 최근 새소식, 화면 바로가기.
 *
 * 예전에는 루트(/)가 곧장 경매장으로 넘어갔다. 구글은 그것을 리다이렉트로 읽어 첫 화면을 수집하지
 * 않았고, 그래서 첫 화면에 실어 둔 사이트 이름과 아이콘도 읽지 못해 검색 결과에 도메인과 기본 아이콘이
 * 떴다. 루트가 제 자리에서 화면을 그려야 구글이 첫 화면으로 본다.
 *
 * 이벤트와 새소식은 워커가 모아 둔 기록(worker/news.js)에서 읽는다. 1200px 이상에서는 둘을 나란히,
 * 그 아래에서는 위아래로 둔다. 휴대폰에서는 이벤트를 둘만 펴 둔다.
 *
 * 칸 목록은 메뉴와 같은 표(app/navigation.tsx)를 읽는다. 화면을 하나 더하면 여기에도 저절로 생긴다.
 */
export function HomePage() {
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const pages = navPages(NAV_TREE);
  const news = canReadNews();

  return (
    <Flex vertical gap={24}>
      <Flex vertical gap={4}>
        {/*
          사이트 이름은 이 쪽의 h1 이다. 구글은 구조화 데이터와 함께 첫 화면의 제목 태그로도 이름을 가늠한다.
          크기는 다른 화면의 제목(h3)과 맞춘다.
        */}
        <Title level={1} style={{ margin: 0, fontSize: token.fontSizeHeading3, lineHeight: token.lineHeightHeading3 }}>
          마비쿠마
        </Title>
        <Text type="secondary">마비노기 경매장 시세와 아이템 정보, 시뮬레이터와 계산기</Text>
      </Flex>

      {news ? (
        <Row gutter={[24, 24]}>
          <Col xs={24} xl={14}>
            <Section title="진행 중인 이벤트">
              <EventBanners initial={screens.sm === false ? 2 : 4} />
            </Section>
          </Col>
          <Col xs={24} xl={10}>
            <Section
              title="새소식"
              extra={
                <Link to="/news" style={{ fontSize: 13 }}>
                  전체 보기 <ChevronRightIcon />
                </Link>
              }
            >
              <LatestNews wide={screens.sm !== false} />
            </Section>
          </Col>
        </Row>
      ) : null}

      {/* 768px 미만은 한 줄에 하나, 넓어질수록 둘, 셋, 넷. */}
      <Row gutter={[16, 16]}>
        {pages.map(({ leaf, trail }) => (
          <Col key={leaf.path} xs={24} sm={12} lg={8} xl={6}>
            <Link to={leaf.path}>
              <Card hoverable size="small" style={{ height: '100%' }}>
                <Flex align="center" gap={12}>
                  <span
                    style={{ display: 'flex', fontSize: 24, color: token.colorPrimary }}
                    aria-hidden="true"
                  >
                    {leaf.icon}
                  </span>
                  <Flex vertical>
                    <Text strong>{leaf.label}</Text>
                    {trail ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {trail}
                      </Text>
                    ) : null}
                  </Flex>
                </Flex>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
    </Flex>
  );
}
