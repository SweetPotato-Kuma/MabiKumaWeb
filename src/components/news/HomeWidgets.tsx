import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Card, Flex, Segmented, Skeleton, Typography, theme } from 'antd';
import { EmptyState } from '@/components/EmptyState';
import { ChevronRightIcon } from '@/components/icons';
import { NewsPostList } from '@/components/news/NewsPostList';
import {
  formatNewsDate,
  newsPostPath,
  useNewsList,
  type NewsCategory,
  type NewsPost,
} from '@/features/news/api';
import { isOnSale, useKitIndexQuery } from '@/features/kits/kits';
import { formatNumber } from '@/lib/format';

const { Text } = Typography;

/** 새소식 블록에 한 번에 보이는 글 수. 배너 아래에서 한 화면에 블록이 다 들어오는 수다. */
const NEWS_ROWS = 6;
/** 위젯마다 보이는 글 수. */
const WIDGET_ROWS = 3;

const NEWS_TABS = ['전체', '공지', '점검', '이벤트', '샵'] as const;
type NewsTab = (typeof NEWS_TABS)[number];

function MoreLink({ to, label = '전체 보기' }: { to: string; label?: string }) {
  return (
    <Link to={to} style={{ fontSize: 13 }}>
      {label} <ChevronRightIcon />
    </Link>
  );
}

/**
 * 첫 화면의 새소식 블록. 공지, 점검, 이벤트, 샵을 탭으로 가르고 최근 글을 스크롤 없이 한 화면에 모아 보인다.
 * 글을 누르면 우리 기록(/news?id=)으로 열린다. 더 보려면 전체 보기로 간다.
 */
export function NewsBlock({ wide }: { wide: boolean }) {
  const [tab, setTab] = useState<NewsTab>('전체');
  const category: NewsCategory | '' = tab === '전체' ? '' : tab;
  const query = useNewsList({ category, q: '', edited: false, page: 1 });
  const posts = query.data?.posts.slice(0, NEWS_ROWS) ?? [];

  return (
    <Card
      size="small"
      title="새소식"
      extra={<MoreLink to={category ? `/news?c=${encodeURIComponent(category)}` : '/news'} />}
      styles={{ body: { paddingBlock: 8 } }}
    >
      <Flex vertical gap={4}>
        <Segmented
          aria-label="새소식 분류"
          value={tab}
          onChange={(value) => setTab(value as NewsTab)}
          options={[...NEWS_TABS]}
        />
        {query.error ? (
          <Alert
            type="error"
            showIcon
            message={
              query.error instanceof Error ? query.error.message : '새소식을 받지 못했습니다.'
            }
          />
        ) : query.data === undefined ? (
          <Skeleton
            active
            title={false}
            paragraph={{ rows: NEWS_ROWS, width: '100%' }}
            aria-busy="true"
          />
        ) : posts.length === 0 ? (
          <EmptyState size="small" description="이 분류에 받아 둔 글이 없습니다." />
        ) : (
          <NewsPostList posts={posts} wide={wide} compact />
        )}
      </Flex>
    </Card>
  );
}

function WidgetCard({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card size="small" title={title} extra={extra} styles={{ body: { paddingBlock: 8 } }}>
      {children}
    </Card>
  );
}

/** 위젯의 글 한 줄. 제목은 한 줄로 줄이고 날짜는 오른쪽 끝에 둔다. */
function PostRows({ posts }: { posts: NewsPost[] }) {
  const { token } = theme.useToken();
  return (
    <Flex vertical gap={6}>
      {posts.map((post) => (
        <Flex key={post.id} justify="space-between" align="baseline" gap={12}>
          <Link
            to={newsPostPath(post.id)}
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: token.colorText,
            }}
          >
            {post.title}
          </Link>
          <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            {formatNewsDate(post.postedAt).slice(5)}
          </Text>
        </Flex>
      ))}
    </Flex>
  );
}

/** 받는 동안과 못 받았을 때, 글이 없을 때는 위젯을 그리지 않는다. 첫 화면의 중심(배너와 새소식)을 흔들지 않으려는 것이다. */
function useWidgetPosts(category: NewsCategory | '', edited: boolean): NewsPost[] {
  const query = useNewsList({ category, q: '', edited, page: 1 });
  return query.error ? [] : (query.data?.posts.slice(0, WIDGET_ROWS) ?? []);
}

/** 최근 개발자 노트. */
export function DevNoteWidget({ persistent = false }: { persistent?: boolean }) {
  const query = useNewsList({ category: '개발자 노트', q: '', edited: false, page: 1 });
  const posts = query.data?.posts.slice(0, WIDGET_ROWS) ?? [];
  if (!persistent && posts.length === 0) return null;
  return (
    <WidgetCard title="개발자 노트" extra={<MoreLink to="/news?c=개발자%20노트" />}>
      {query.error ? (
        <Text type="danger">개발자 노트를 불러오지 못했습니다.</Text>
      ) : !query.data ? (
        <Skeleton active title={false} paragraph={{ rows: 2 }} />
      ) : posts.length ? (
        <PostRows posts={posts} />
      ) : (
        <Text type="secondary">등록된 개발자 노트가 없습니다.</Text>
      )}
    </WidgetCard>
  );
}

/**
 * 올린 뒤에 고쳐진 글. 공식 홈페이지는 공지를 고쳐도 새 글을 올리지 않아 무엇이 바뀌었는지 알기 어렵다.
 * 고친 글이 아직 없으면 그리지 않는다.
 */
export function EditedWidget() {
  const posts = useWidgetPosts('', true);
  if (posts.length === 0) return null;
  return (
    <WidgetCard title="고친 글" extra={<MoreLink to="/news?c=edited" />}>
      <PostRows posts={posts} />
    </WidgetCard>
  );
}

/** 지금 파는 키트. 이름을 누르면 키트 시뮬레이터로 간다. 파는 키트가 없으면 그리지 않는다. */
export function KitWidget({ persistent = false }: { persistent?: boolean }) {
  const { token } = theme.useToken();
  const query = useKitIndexQuery();
  const index = query.data;
  const onSale = index ? index.kits.filter((kit) => isOnSale(index, kit)) : [];
  if (!persistent && onSale.length === 0) return null;
  return (
    <WidgetCard title="판매 중인 키트" extra={<MoreLink to="/kit-simulator" label="시뮬레이터" />}>
      <Flex vertical gap={6}>
        {query.error ? (
          <Text type="danger">키트를 불러오지 못했습니다.</Text>
        ) : !index ? (
          <Skeleton active title={false} paragraph={{ rows: 2 }} />
        ) : !onSale.length ? (
          <Text type="secondary">현재 판매 중인 키트가 없습니다.</Text>
        ) : null}
        {onSale.map((kit) => (
          <Flex key={kit.id} justify="space-between" align="baseline" gap={12}>
            <Link
              to="/kit-simulator"
              style={{
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: token.colorText,
              }}
            >
              {kit.name}
            </Link>
            <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              {[
                kit.end ? `${kit.end.slice(5).replace('-', '.')}까지` : '',
                kit.price !== null ? `${formatNumber(kit.price)} 캐시` : '',
              ]
                .filter(Boolean)
                .join(', ')}
            </Text>
          </Flex>
        ))}
      </Flex>
    </WidgetCard>
  );
}
