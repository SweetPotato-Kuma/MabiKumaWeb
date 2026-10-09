import { Link } from 'react-router-dom';
import { Card, Col, Flex, Grid, Row, Typography, theme } from 'antd';
import { NAV_TREE, navPages } from '@/app/navigation';
import { BannerCarousel } from '@/components/news/BannerCarousel';
import { DevNoteWidget, EditedWidget, KitWidget, NewsBlock } from '@/components/news/HomeWidgets';
import { canReadNews } from '@/features/news/api';

const { Title, Text } = Typography;

/**
 * 첫 화면. 사이트 이름, 이벤트 배너, 새소식 블록과 위젯, 화면 바로가기.
 *
 * 예전에는 루트(/)가 곧장 경매장으로 넘어갔다. 구글은 그것을 리다이렉트로 읽어 첫 화면을 수집하지
 * 않았고, 그래서 첫 화면에 실어 둔 사이트 이름과 아이콘도 읽지 못해 검색 결과에 도메인과 기본 아이콘이
 * 떴다. 루트가 제 자리에서 화면을 그려야 구글이 첫 화면으로 본다.
 *
 * 배치(1200px 이상): 맨 위에 큰 이벤트 배너, 그 아래 왼쪽에 새소식 블록, 오른쪽에 위젯 열(판매 중인 키트, 개발자 노트,
 * 고친 글). 그 아래가 바로가기다. 1200px 미만은 한 줄로 쌓는다. 배너, 새소식, 위젯은 워커가 모아 둔 공식 홈페이지
 * 기록(worker/news.js, banners.js, kits.js)에서 읽고, 위젯은 보일 것이 없으면 스스로 사라진다.
 *
 * 바로가기 칸은 메뉴와 같은 표(app/navigation.tsx)를 읽는다. 화면을 하나 더하면 여기에도 저절로 생긴다.
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
        <Title
          level={1}
          style={{
            margin: 0,
            fontSize: token.fontSizeHeading3,
            lineHeight: token.lineHeightHeading3,
          }}
        >
          마비쿠마
        </Title>
        <Text type="secondary">마비노기 경매장 시세와 아이템 정보, 시뮬레이터와 계산기</Text>
      </Flex>

      {news ? (
        <>
          <BannerCarousel />
          <Row gutter={[24, 24]}>
            <Col xs={24} xl={16}>
              <NewsBlock wide={screens.sm !== false} />
            </Col>
            <Col xs={24} xl={8}>
              <Flex vertical gap={16}>
                <KitWidget />
                <DevNoteWidget />
                <EditedWidget />
              </Flex>
            </Col>
          </Row>
        </>
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
