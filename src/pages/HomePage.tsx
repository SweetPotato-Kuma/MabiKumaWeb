import { useState, type CSSProperties, type ReactNode } from 'react';
import { Alert, App, Button, Card, Flex, Grid, Select, Switch, Typography } from 'antd';
import { BannerCarousel } from '@/components/news/BannerCarousel';
import { DevNoteWidget, EditedWidget, KitWidget, NewsBlock } from '@/components/news/HomeWidgets';
import { FavoritesWidget, HornWidget, MemoWidget } from '@/components/home/PersonalWidgets';
import { canReadNews } from '@/features/news/api';
import {
  defaultLayout,
  saveLayout,
  useHomeLayout,
  WIDGETS,
  type WidgetLayout,
} from '@/features/home/layout';

/** 루트의 h1은 검색 엔진과 화면 낭독기에 남긴다. */
export function HomePage() {
  const screens = Grid.useBreakpoint();
  const layout = useHomeLayout();
  const [editing, setEditing] = useState(false);
  const { message } = App.useApp();
  const news = canReadNews();
  const unavailable = (
    <Card size="small">
      <Typography.Text type="secondary">새소식을 연결하면 표시됩니다.</Typography.Text>
    </Card>
  );
  const widgets: Record<keyof typeof WIDGETS, ReactNode> = {
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
  function save(next: WidgetLayout[]) {
    try {
      saveLayout(next);
    } catch {
      void message.error('위젯 구성을 저장하지 못했습니다. 다시 시도해 주세요.');
    }
  }
  function move(index: number, direction: number) {
    const next = [...layout];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    save(next);
  }
  return (
    <Flex vertical gap={16}>
      <h1 className="home-sr-only">마비쿠마</h1>
      <Flex justify="flex-end">
        <Button
          size="small"
          onClick={() => setEditing(!editing)}
          aria-expanded={editing}
          aria-controls="home-widget-settings"
        >
          {editing ? '편집 완료' : '위젯 편집'}
        </Button>
      </Flex>
      {editing && (
        <Card
          size="small"
          title="내 홈 구성"
          id="home-widget-settings"
          extra={
            <Button size="small" onClick={() => save(defaultLayout())}>
              기본 배치
            </Button>
          }
        >
          <Flex vertical gap={12}>
            <Typography.Text type="secondary">
              표시할 위젯과 순서, 너비를 고르세요. 넓은 화면에서는 한 줄에 5칸, 작은 화면에서는
              자동으로 배치됩니다.
            </Typography.Text>
            {layout.map((widget, index) => (
              <Flex key={widget.id} align="center" gap={8} wrap>
                <Switch
                  size="small"
                  aria-label={`${WIDGETS[widget.id].title} 표시`}
                  checked={widget.visible}
                  onChange={(visible) =>
                    save(
                      layout.map((item) => (item.id === widget.id ? { ...item, visible } : item)),
                    )
                  }
                />
                <Typography.Text style={{ flex: '1 1 160px' }}>
                  {WIDGETS[widget.id].title}
                </Typography.Text>
                <Select
                  size="small"
                  aria-label={`${WIDGETS[widget.id].title} 너비`}
                  value={widget.width}
                  options={[1, 2, 3, 4, 5].map((width) => ({ value: width, label: `${width}칸` }))}
                  onChange={(width) =>
                    save(layout.map((item) => (item.id === widget.id ? { ...item, width } : item)))
                  }
                />
                <Button
                  size="small"
                  aria-label={`${WIDGETS[widget.id].title} 앞으로`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  size="small"
                  aria-label={`${WIDGETS[widget.id].title} 뒤로`}
                  disabled={index === layout.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </Button>
              </Flex>
            ))}
          </Flex>
        </Card>
      )}
      {!layout.some((widget) => widget.visible) && (
        <Alert type="info" message="위젯 편집에서 홈에 표시할 위젯을 켜 주세요." />
      )}
      <div className="home-widget-grid" aria-label="홈 위젯">
        {layout
          .filter((widget) => widget.visible)
          .map((widget) => (
            <section
              key={widget.id}
              aria-label={WIDGETS[widget.id].title}
              className={`home-widget home-widget-${widget.id}`}
              style={
                {
                  '--widget-columns': widget.width,
                  '--widget-rows': ['kits', 'dev', 'edited'].includes(widget.id) ? 1 : 2,
                } as CSSProperties
              }
            >
              {widgets[widget.id]}
            </section>
          ))}
      </div>
    </Flex>
  );
}
