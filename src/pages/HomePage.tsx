import type { CSSProperties } from 'react';
import { Col, Flex, Grid, Row, Typography } from 'antd';
import { BannerCarousel } from '@/components/news/BannerCarousel';
import { DevNoteWidget, EditedWidget, KitWidget, NewsBlock } from '@/components/news/HomeWidgets';
import { canReadNews } from '@/features/news/api';

const { Title } = Typography;

/** 눈에는 안 보이고 화면 낭독기와 검색 엔진은 읽는 글. 보이는 제목은 헤더의 로고가 맡는다. */
const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/**
 * 첫 화면. 이벤트 배너, 새소식 블록과 위젯.
 *
 * 예전에는 루트(/)가 곧장 경매장으로 넘어갔다. 구글은 그것을 리다이렉트로 읽어 첫 화면을 수집하지
 * 않았고, 그래서 첫 화면에 실어 둔 사이트 이름과 아이콘도 읽지 못해 검색 결과에 도메인과 기본 아이콘이
 * 떴다. 루트가 제 자리에서 화면을 그려야 구글이 첫 화면으로 본다.
 *
 * 사이트 이름은 이 쪽의 h1 이다. 구글은 구조화 데이터와 함께 첫 화면의 제목 태그로도 이름을 가늠한다. 사용자 요청으로
 * (2026-10) 눈에 보이는 제목과 설명 줄은 지우고, 제목은 보이지 않게 남겨 검색 엔진과 화면 낭독기가 읽게 한다.
 *
 * 배치(1200px 이상): 맨 위에 이벤트 배너, 그 아래 왼쪽에 새소식 블록, 오른쪽에 위젯 열(판매 중인 키트, 개발자 노트,
 * 고친 글). 1200px 미만은 한 줄로 쌓는다. 배너, 새소식, 위젯은 워커가 모아 둔 공식 홈페이지 기록(worker/news.js,
 * banners.js, kits.js)에서 읽고, 위젯은 보일 것이 없으면 스스로 사라진다. 화면 바로가기는 헤더 메뉴가 맡아 이 쪽에는 두지 않는다.
 */
export function HomePage() {
  const screens = Grid.useBreakpoint();
  const news = canReadNews();

  return (
    <Flex vertical gap={24}>
      <Title level={1} style={VISUALLY_HIDDEN}>
        마비쿠마
      </Title>

      {news ? (
        <>
          <BannerCarousel />
          <Row gutter={[24, 24]}>
            <Col xs={24} xl={16}>
              <NewsBlock wide={screens.sm !== false} />
            </Col>
            <Col xs={24} xl={8}>
              <Flex vertical gap={12}>
                <KitWidget />
                <DevNoteWidget />
                <EditedWidget />
              </Flex>
            </Col>
          </Row>
        </>
      ) : null}
    </Flex>
  );
}
