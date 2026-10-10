import { type ReactNode } from 'react';
import { Alert, Card, Flex, Grid, Typography } from 'antd';
import { BannerCarousel } from '@/components/news/BannerCarousel';
import { DevNoteWidget, EditedWidget, KitWidget, NewsBlock } from '@/components/news/HomeWidgets';
import { FavoritesWidget, HornWidget, MemoWidget } from '@/components/home/PersonalWidgets';
import { HomeWidgetCanvas } from '@/components/home/HomeWidgetCanvas';
import { canReadNews } from '@/features/news/api';
import { useHomeLayout, type WidgetId } from '@/features/home/layout';

/** 루트의 h1은 검색 엔진과 화면 낭독기에 남긴다. */
export function HomePage() {
  const screens = Grid.useBreakpoint();
  const layout = useHomeLayout();
  const news = canReadNews();
  const unavailable = (
    <Card size="small">
      <Typography.Text type="secondary">새소식을 연결하면 표시됩니다.</Typography.Text>
    </Card>
  );
  const widgets: Record<WidgetId, ReactNode> = {
    banner: news ? <BannerCarousel persistent /> : unavailable,
    news: news ? (
      <NewsBlock
        wide={
          screens.md === true && (layout.find((widget) => widget.id === 'news')?.width ?? 3) >= 3
        }
      />
    ) : (
      unavailable
    ),
    kits: news ? <KitWidget persistent /> : unavailable,
    dev: news ? <DevNoteWidget persistent /> : unavailable,
    edited: news ? <EditedWidget /> : unavailable,
    favorites: <FavoritesWidget />,
    horn: <HornWidget />,
    memo: <MemoWidget />,
  };
  return (
    <Flex vertical gap={16}>
      <h1 className="home-sr-only">마비쿠마</h1>
      {!layout.some((widget) => widget.visible) && (
        <Alert type="info" message="설정의 위젯 편집에서 홈에 표시할 위젯을 켜 주세요." />
      )}
      <HomeWidgetCanvas>{(id) => widgets[id]}</HomeWidgetCanvas>
    </Flex>
  );
}
