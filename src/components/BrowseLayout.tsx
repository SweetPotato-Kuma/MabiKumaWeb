import type { ReactNode } from 'react';
import { Card, Col, Flex, Grid, Row, Typography } from 'antd';

const { Title } = Typography;

/**
 * 제목 줄. 오른쪽 끝에 보기 전환 같은 조작을 둘 수 있다.
 *
 * 조작을 제목 아래 줄에 두었더니 그 줄 높이만큼 아이템 정보의 본문이 경매장보다 내려앉아,
 * 두 화면을 오갈 때 카테고리 카드가 덜컹 내려갔다. 제목과 같은 줄(높이 32)에 두면 본문이
 * 시작하는 자리가 조작이 있든 없든 같다.
 */
export function BrowseTitle({ title, extra }: { title: ReactNode; extra?: ReactNode }) {
  return (
    <Flex justify="space-between" align="center" gap={12} wrap>
      <Title level={3} style={{ margin: 0 }}>
        {title}
      </Title>
      {extra}
    </Flex>
  );
}

interface BrowseLayoutProps {
  title: ReactNode;
  /** 제목 줄 오른쪽에 둘 조작. */
  extra?: ReactNode;
  /** 제목과 본문 사이에 끼는 알림. 평소에는 비어 있다. */
  notice?: ReactNode;
  /** 왼쪽 고르기 카드의 제목. */
  sideTitle: ReactNode;
  /** 왼쪽 고르기(카테고리 트리, 제작 스킬 목록). */
  side: ReactNode;
  children: ReactNode;
}

/**
 * 경매장과 아이템 정보가 함께 쓰는 2단 틀. 왼쪽은 고르기, 오른쪽은 검색과 결과다.
 *
 * 두 화면이 각자 칸 비율과 간격을 들고 있을 때는 왼쪽 카드 폭이 25% 와 33% 로 달라,
 * 메뉴로 오가면 카테고리 카드와 결과 칸이 옆으로 늘었다 줄었다 했다. 폭과 간격은 여기 한 곳에서 정한다.
 *
 * 768px 미만에서는 한 단으로 떨어진다. 그때 고르기는 Select 하나라 카드로 감싸지 않는다.
 */
export function BrowseLayout({ title, extra, notice, sideTitle, side, children }: BrowseLayoutProps) {
  const screens = Grid.useBreakpoint();

  return (
    <Flex vertical gap={16}>
      <BrowseTitle title={title} extra={extra} />
      {notice}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8} lg={6}>
          {/* 카드 안에 스크롤을 두지 않는다. 까닭은 경매장 화면의 categoryPanel 주석에 있다. */}
          {screens.md ? (
            <Card variant="outlined" size="small" title={sideTitle}>
              {side}
            </Card>
          ) : (
            side
          )}
        </Col>
        <Col xs={24} md={16} lg={18}>
          {children}
        </Col>
      </Row>
    </Flex>
  );
}
