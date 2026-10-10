import { useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { App, Button, Card, Dropdown, Flex, Typography, type MenuProps } from 'antd';
import { useSearchParams } from 'react-router-dom';
import {
  defaultLayout,
  saveLayout,
  useHomeLayout,
  WIDGETS,
  type WidgetId,
  type WidgetLayout,
} from '@/features/home/layout';

const DRAG_TYPE = 'application/x-mabikuma-widget';

export function HomeWidgetCanvas({ children }: { children: (id: WidgetId) => ReactNode }) {
  const layout = useHomeLayout();
  const [params, setParams] = useSearchParams();
  const editing = params.get('editWidgets') === '1';
  const [dragging, setDragging] = useState<WidgetId | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const { message } = App.useApp();
  function save(next: WidgetLayout[]) {
    try {
      saveLayout(next);
    } catch {
      void message.error('위젯 구성을 저장하지 못했습니다. 다시 시도해 주세요.');
    }
  }
  function update(id: WidgetId, change: Partial<WidgetLayout>) {
    save(layout.map((widget) => (widget.id === id ? { ...widget, ...change } : widget)));
  }
  function place(id: WidgetId, before?: WidgetId) {
    if (id === before) return;
    const widget = layout.find((item) => item.id === id);
    if (!widget) return;
    const next = layout.filter((item) => item.id !== id);
    const index = before ? next.findIndex((item) => item.id === before) : next.length;
    next.splice(index < 0 ? next.length : index, 0, { ...widget, visible: true });
    save(next);
  }
  function move(id: WidgetId, direction: number) {
    const next = [...layout];
    const index = next.findIndex((item) => item.id === id);
    const visible = next.map((item, i) => (item.visible ? i : -1)).filter((i) => i >= 0);
    const target = visible[visible.indexOf(index) + direction];
    if (target === undefined) return;
    [next[index], next[target]] = [next[target], next[index]];
    save(next);
  }
  function start(event: DragEvent, id: WidgetId) {
    event.dataTransfer.setData(DRAG_TYPE, id);
    event.dataTransfer.effectAllowed = 'move';
    setDragging(id);
  }
  function end() {
    setDragging(null);
    setOver(null);
  }
  function drop(event: DragEvent, before?: WidgetId) {
    event.preventDefault();
    if (dragging && event.dataTransfer.getData(DRAG_TYPE) === dragging) place(dragging, before);
    end();
  }
  function menu(widget: WidgetLayout): MenuProps {
    const visible = layout.filter((item) => item.visible);
    return {
      triggerSubMenuAction: 'click',
      selectedKeys: [`width-${widget.width}`],
      items: [
        {
          key: 'size',
          label: '너비',
          children: [1, 2, 3, 4, 5].map((width) => ({
            key: `width-${width}`,
            label: `${width}칸${width === widget.width ? ' ✓' : ''}`,
          })),
        },
        { key: 'previous', label: '앞으로 이동', disabled: visible[0]?.id === widget.id },
        { key: 'next', label: '뒤로 이동', disabled: visible.at(-1)?.id === widget.id },
        { type: 'divider' },
        { key: 'hide', label: '위젯 숨기기' },
      ],
      onClick: ({ key }) => {
        if (key.startsWith('width-')) update(widget.id, { width: Number(key.slice(6)) });
        else if (key === 'hide') update(widget.id, { visible: false });
        else if (key === 'previous' || key === 'next') move(widget.id, key === 'previous' ? -1 : 1);
      },
    };
  }
  return (
    <>
      {editing && (
        <Card
          size="small"
          className="home-widget-editor"
          title="내 홈 구성"
          extra={
            <Flex gap={8}>
              <Button size="small" onClick={() => save(defaultLayout())}>
                기본 배치
              </Button>
              <Button
                size="small"
                type="primary"
                onClick={() => {
                  end();
                  const next = new URLSearchParams(params);
                  next.delete('editWidgets');
                  setParams(next, { replace: true });
                }}
              >
                편집 완료
              </Button>
            </Flex>
          }
        >
          <Typography.Paragraph type="secondary">
            위젯의 이동 손잡이를 끌어 놓으세요. 우클릭 또는 ⋯ 메뉴에서 너비·순서·숨기기를 바꿀 수
            있습니다. 변경은 자동 저장됩니다.
          </Typography.Paragraph>
          <div className="home-widget-palette" aria-label="추가할 위젯">
            {layout
              .filter((widget) => !widget.visible)
              .map((widget) => (
                <button
                  type="button"
                  className="home-widget-tile"
                  key={widget.id}
                  draggable
                  onDragStart={(event) => start(event, widget.id)}
                  onDragEnd={end}
                  onClick={() => place(widget.id)}
                  aria-label={`${WIDGETS[widget.id].title} 추가`}
                >
                  <span aria-hidden="true" className="home-widget-tile-preview">
                    ＋
                  </span>
                  {WIDGETS[widget.id].title}
                </button>
              ))}
            {layout.every((widget) => widget.visible) && (
              <Typography.Text type="secondary">
                모든 위젯이 홈에 표시되고 있습니다.
              </Typography.Text>
            )}
          </div>
        </Card>
      )}
      <div
        className={`home-widget-grid${editing ? ' home-widget-grid-editing' : ''}`}
        aria-label="홈 위젯"
      >
        {layout
          .filter((widget) => widget.visible)
          .map((widget) => {
            const content = (
              <section
                key={widget.id}
                aria-label={WIDGETS[widget.id].title}
                className={`home-widget home-widget-${widget.id}${over === widget.id ? ' home-widget-drop-target' : ''}${dragging === widget.id ? ' home-widget-dragging' : ''}`}
                style={
                  {
                    '--widget-columns': widget.width,
                    '--widget-rows':
                      widget.id === 'memo'
                        ? 4
                        : ['kits', 'dev', 'edited'].includes(widget.id)
                          ? 1
                          : 2,
                  } as CSSProperties
                }
                onDragOver={(event) => {
                  if (editing && dragging) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setOver(widget.id);
                  }
                }}
                onDrop={(event) => {
                  if (editing && dragging) drop(event, widget.id);
                }}
              >
                {editing && (
                  <div className="home-widget-edit-bar">
                    <button
                      type="button"
                      className="home-widget-drag-handle"
                      draggable
                      onDragStart={(event) => start(event, widget.id)}
                      onDragEnd={end}
                      aria-label={`${WIDGETS[widget.id].title} 이동 손잡이`}
                      title="끌어서 이동 · 메뉴로도 순서를 바꿀 수 있습니다"
                    >
                      <span aria-hidden="true">⠿</span> {WIDGETS[widget.id].title}
                    </button>
                    <Dropdown menu={menu(widget)} trigger={['click']}>
                      <Button
                        type="text"
                        size="small"
                        aria-label={`${WIDGETS[widget.id].title} 설정`}
                      >
                        ⋯
                      </Button>
                    </Dropdown>
                  </div>
                )}
                {children(widget.id)}
              </section>
            );
            return editing ? (
              <Dropdown key={widget.id} menu={menu(widget)} trigger={['contextMenu']}>
                {content}
              </Dropdown>
            ) : (
              content
            );
          })}
        {editing && (
          <div
            className={`home-widget-drop-end${over === 'end' ? ' home-widget-drop-target' : ''}`}
            onDragOver={(event) => {
              if (dragging) {
                event.preventDefault();
                setOver('end');
              }
            }}
            onDrop={(event) => drop(event)}
            aria-label="마지막 위치에 위젯 놓기"
          >
            여기에 끌어 놓아 마지막에 배치
          </div>
        )}
      </div>
    </>
  );
}
