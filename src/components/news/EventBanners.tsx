import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, Flex, Skeleton, Typography, theme } from 'antd';
import { EmptyState } from '@/components/EmptyState';
import {
  eventRemaining,
  formatNewsDate,
  newsPostPath,
  useNewsEvents,
  type NewsEvent,
} from '@/features/news/api';

const { Text } = Typography;

/** 이벤트 목록 그림의 크기(410 x 150). 그림이 늦게 떠도 칸이 밀리지 않게 비율을 미리 잡는다. */
const THUMB_WIDTH = 410;
const THUMB_HEIGHT = 150;
const THUMB_RATIO = `${THUMB_WIDTH} / ${THUMB_HEIGHT}`;

/** 줄마다 칸이 몇 개 들든 한 칸이 이보다 좁아지지 않는다. 좁으면 한 줄에 하나가 된다. */
const GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: 16,
} as const;

const shortDate = (seconds: number) => formatNewsDate(seconds).slice(5);

/** "10.08 ~ 10.21" 이나 "상시진행". */
function periodText(event: NewsEvent): string {
  if (event.startsAt !== null && event.endsAt !== null)
    return `${shortDate(event.startsAt)} ~ ${shortDate(event.endsAt)}`;
  return event.period ?? '';
}

/** 받아 둔 이벤트 글이면 우리 기록으로, 이벤트 페이지면 공식 홈페이지로 잇는다. */
function EventLink({ event, children }: { event: NewsEvent; children: ReactNode }) {
  if (event.postId !== null) {
    return (
      <Link to={newsPostPath(event.postId)} style={{ display: 'block', height: '100%' }}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={event.link}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: 'block', height: '100%' }}
    >
      {children}
    </a>
  );
}

function EventCard({ event }: { event: NewsEvent }) {
  const { token } = theme.useToken();
  const remaining = eventRemaining(event);
  return (
    <EventLink event={event}>
      <Card
        hoverable
        size="small"
        style={{ height: '100%' }}
        cover={
          event.thumb ? (
            <img
              src={event.thumb}
              alt=""
              width={THUMB_WIDTH}
              height={THUMB_HEIGHT}
              loading="lazy"
              style={{
                width: '100%',
                height: 'auto',
                aspectRatio: THUMB_RATIO,
                objectFit: 'cover',
              }}
            />
          ) : (
            <div style={{ aspectRatio: THUMB_RATIO, background: token.colorFillTertiary }} />
          )
        }
      >
        <Flex vertical gap={2}>
          <Text strong ellipsis={{ tooltip: event.title }}>
            {event.title}
          </Text>
          {event.summary ? (
            <Text type="secondary" ellipsis style={{ fontSize: 13 }}>
              {event.summary}
            </Text>
          ) : null}
          <Flex gap={8} wrap className="tnum" style={{ fontSize: 13 }}>
            <Text type="secondary">{periodText(event)}</Text>
            {remaining ? <Text>{remaining}</Text> : null}
          </Flex>
        </Flex>
      </Card>
    </EventLink>
  );
}

function EventSkeleton() {
  const { token } = theme.useToken();
  return (
    <div style={GRID_STYLE} aria-busy="true" aria-live="polite">
      {Array.from({ length: 4 }, (_, index) => (
        <Card
          key={index}
          size="small"
          cover={<div style={{ aspectRatio: THUMB_RATIO, background: token.colorFillTertiary }} />}
        >
          <Skeleton active title={{ width: '70%' }} paragraph={{ rows: 1, width: '50%' }} />
        </Card>
      ))}
    </div>
  );
}

/**
 * 진행 중인 이벤트. 공식 홈페이지 이벤트 목록의 그림과 기간을 그대로 보여 준다. 처음에는 initial 개만 펴 둔다.
 */
export function EventBanners({ initial }: { initial: number }) {
  const query = useNewsEvents();
  const [open, setOpen] = useState(false);

  if (query.error) {
    return (
      <Alert
        type="error"
        showIcon
        message={query.error instanceof Error ? query.error.message : '이벤트를 받지 못했습니다.'}
      />
    );
  }
  if (query.isLoading || !query.data) return <EventSkeleton />;

  const { events } = query.data;
  if (events.length === 0)
    return <EmptyState size="small" description="진행 중인 이벤트가 없습니다." />;

  const shown = open ? events : events.slice(0, initial);
  return (
    <Flex vertical gap={12} align="flex-start">
      <div style={{ ...GRID_STYLE, width: '100%' }}>
        {shown.map((event) => (
          <EventCard key={event.link} event={event} />
        ))}
      </div>
      {events.length > initial ? (
        <Button onClick={() => setOpen((prev) => !prev)} aria-expanded={open}>
          {open ? '접기' : `이벤트 ${events.length}개 모두 보기`}
        </Button>
      ) : null}
    </Flex>
  );
}
