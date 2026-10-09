import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Flex,
  Form,
  Grid,
  Input,
  Pagination,
  Segmented,
  Select,
  Tag,
  Typography,
} from 'antd';
import pageMeta from '@/app/pageMeta.json';
import { pageMetaFor } from '@/app/pageMeta';
import { QueryState } from '@/components/QueryState';
import { OpenInNewIcon } from '@/components/icons';
import { NewsBody } from '@/components/news/NewsBody';
import { NewsDiff } from '@/components/news/NewsDiff';
import { NewsPostList, NewsPostTags } from '@/components/news/NewsPostList';
import {
  NEWS_CATEGORIES,
  canReadNews,
  formatNewsDateTime,
  useNewsList,
  useNewsPost,
  type NewsCategory,
  type NewsListResponse,
  type NewsRevision,
} from '@/features/news/api';

const { Title, Text } = Typography;

type FilterKey = NewsCategory | '' | 'edited';

const FILTER_OPTIONS: { value: FilterKey; label: string }[] = [
  { value: '', label: '전체' },
  ...NEWS_CATEGORIES.map((category) => ({ value: category, label: category })),
  { value: 'edited', label: '고친 글' },
];

const isFilterKey = (value: string): value is FilterKey =>
  FILTER_OPTIONS.some((option) => option.value === value);

/**
 * 받아 둔 글 수와 마지막으로 모은 시각. 지난 글을 아직 다 채우지 못했으면 그렇다고 적는다.
 * 공식 홈페이지보다 글이 적어 보이는 까닭을 숨기지 않는다.
 */
function CollectState({ data }: { data: NewsListResponse }) {
  const filling = Object.values(data.backfill).some((state) => state !== 'done');
  return (
    <Flex gap={12} wrap className="tnum" style={{ fontSize: 13 }}>
      <Text type="secondary">{data.total.toLocaleString('ko-KR')}개</Text>
      {data.collectedAt ? (
        <Text type="secondary">{formatNewsDateTime(data.collectedAt)} 모음</Text>
      ) : null}
      {filling ? <Text type="secondary">지난 글을 채우는 중</Text> : null}
      {data.failedSteps?.length ? (
        <Text type="warning">일부 갱신을 완료하지 못했습니다. 다음 수집에서 다시 시도합니다.</Text>
      ) : null}
    </Flex>
  );
}

function NewsListView() {
  const screens = Grid.useBreakpoint();
  const wide = screens.md !== false;
  const [params, setParams] = useSearchParams();
  const rawFilter = params.get('c') ?? '';
  const filter: FilterKey = isFilterKey(rawFilter) ? rawFilter : '';
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);

  const update = (next: Record<string, string | null>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value);
      else merged.delete(key);
    }
    setParams(merged);
  };

  const query = useNewsList({
    category: filter === 'edited' ? '' : filter,
    edited: filter === 'edited',
    q,
    page,
  });
  const data = query.data;
  const available = canReadNews();

  return (
    <Flex vertical gap={20}>
      <Title level={3} style={{ margin: 0 }}>
        새소식
      </Title>

      {!available ? (
        <Alert
          type="warning"
          showIcon
          message="지금은 새소식을 볼 수 없습니다. 조회 서버 주소가 설정되지 않았습니다."
        />
      ) : null}

      <Card variant="outlined">
        <Form layout="vertical" onFinish={() => update({ q: draft.trim() || null, page: null })}>
          <Flex vertical={!wide} wrap align={wide ? 'flex-end' : undefined} gap={wide ? 24 : 16}>
            {/* 일곱 칸이라 576px 미만에서는 한 줄에 들지 않는다. 그때는 고르기 상자다. */}
            <Form.Item
              label="분류"
              htmlFor={screens.sm === false ? 'news-filter' : undefined}
              style={{ marginBottom: 0 }}
            >
              {screens.sm === false ? (
                <Select
                  id="news-filter"
                  value={filter}
                  onChange={(value: FilterKey) => update({ c: value || null, page: null })}
                  options={FILTER_OPTIONS}
                />
              ) : (
                <Segmented
                  aria-label="분류"
                  value={filter}
                  onChange={(value) => update({ c: String(value) || null, page: null })}
                  options={FILTER_OPTIONS}
                />
              )}
            </Form.Item>
            <Form.Item
              label="제목"
              htmlFor="news-q"
              style={{ marginBottom: 0, flex: wide ? '0 1 320px' : undefined }}
            >
              <Input.Search
                id="news-q"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onSearch={(value) => update({ q: value.trim() || null, page: null })}
                placeholder="예: 패치"
                allowClear
                maxLength={40}
                enterButton="찾기"
              />
            </Form.Item>
          </Flex>
        </Form>
      </Card>

      <QueryState
        isLoading={available && query.isLoading}
        error={query.error}
        isEmpty={!data || data.posts.length === 0}
        emptyMessage={q ? `제목에 "${q}" 가 든 글이 없습니다.` : '이 분류에 받아 둔 글이 없습니다.'}
      >
        {data ? (
          <Card variant="outlined">
            <Flex vertical gap={16}>
              <CollectState data={data} />
              <NewsPostList posts={data.posts} wide={wide} />
              {data.total > data.size ? (
                <Pagination
                  align="center"
                  current={data.page}
                  pageSize={data.size}
                  total={data.total}
                  showSizeChanger={false}
                  simple={!wide}
                  onChange={(next) => {
                    update({ page: next > 1 ? String(next) : null });
                    window.scrollTo({ top: 0 });
                  }}
                />
              ) : null}
            </Flex>
          </Card>
        ) : null}
      </QueryState>
    </Flex>
  );
}

/**
 * 글 한 편 단의 폭. 공식 홈페이지 본문 칸의 가장 넓은 것(이벤트 그림 840px)에 카드 안쪽 여백과 테두리를 더한 값이다.
 * 더 넓히면 글 줄이 너무 길어지고, 좁히면 이벤트 그림이 줄어든다.
 */
const POST_COLUMN_WIDTH = 890;

const revisionLabel = (revision: NewsRevision) => {
  const when = formatNewsDateTime(revision.seenAt).slice(5);
  return revision.rev === 1 ? `처음 ${when}` : `고침 ${revision.rev - 1} ${when}`;
};

function NewsPostView({ id }: { id: number }) {
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const [params, setParams] = useSearchParams();
  const query = useNewsPost(id);
  const data = query.data;

  const revisions = data?.revisions ?? [];
  const latest = revisions.at(-1)?.rev ?? 1;
  const requestedRev = Number(params.get('rev'));
  const rev = revisions.some((revision) => revision.rev === requestedRev) ? requestedRev : latest;
  const current = revisions.find((revision) => revision.rev === rev);
  const previous = revisions.find((revision) => revision.rev === rev - 1);
  const showDiff = params.get('view') === 'diff' && previous !== undefined;

  const set = (next: Record<string, string | null>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value);
      else merged.delete(key);
    }
    setParams(merged, { replace: true });
  };

  useEffect(() => {
    if (!data) return;
    document.title = `${data.post.title} · ${pageMeta.siteName}`;
    return () => {
      document.title = pageMetaFor('/news').title;
    };
  }, [data]);

  // 목록에서 왔으면 그 쪽과 거르기로 돌아간다. 주소로 바로 들어왔으면 목록 첫 쪽으로.
  const back = () => {
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (index > 0) navigate(-1);
    else navigate('/news');
  };

  const revisionOptions = revisions.map((revision) => ({
    value: revision.rev,
    label: revisionLabel(revision),
  }));

  // 글 한 편은 가운데 한 단에 둔다. 넓은 화면에서 본문이 왼쪽에 붙고 오른쪽이 비어 보였다. 글은 그 단의 왼쪽부터 시작한다.
  return (
    <Flex
      vertical
      gap={20}
      style={{ width: '100%', maxWidth: POST_COLUMN_WIDTH, marginInline: 'auto' }}
    >
      <div>
        <Button type="link" onClick={back} style={{ paddingInline: 0 }}>
          새소식 목록
        </Button>
      </div>

      <QueryState
        isLoading={query.isLoading}
        error={query.error}
        isEmpty={!data}
        errorAction={
          <a
            href={`https://mabinogi.nexon.com/page/news/notice_view.asp?id=${id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            공식 홈페이지에서 보기 <OpenInNewIcon />
          </a>
        }
      >
        {data && current ? (
          <Flex vertical gap={16}>
            <Flex vertical gap={8}>
              <Title level={3} style={{ margin: 0 }}>
                {data.post.title}
              </Title>
              <Flex align="center" gap={12} wrap style={{ fontSize: 13 }}>
                <Tag variant="filled" style={{ marginInlineEnd: 0 }}>
                  {data.post.category}
                </Tag>
                {data.post.author ? <Text type="secondary">{data.post.author}</Text> : null}
                <Text type="secondary" className="tnum">
                  {formatNewsDateTime(data.post.postedAt)}
                </Text>
                <NewsPostTags post={data.post} />
                <a href={data.source} target="_blank" rel="noopener noreferrer">
                  공식 홈페이지 <OpenInNewIcon />
                </a>
              </Flex>
            </Flex>

            {revisions.length > 1 ? (
              <Flex
                vertical={screens.sm === false}
                gap={12}
                wrap
                align={screens.sm === false ? undefined : 'center'}
              >
                {revisions.length <= 3 && screens.md !== false ? (
                  <Segmented
                    aria-label="판"
                    value={rev}
                    onChange={(value) =>
                      set({ rev: Number(value) === latest ? null : String(value) })
                    }
                    options={revisionOptions}
                  />
                ) : (
                  <Select
                    aria-label="판"
                    value={rev}
                    onChange={(value: number) =>
                      set({ rev: value === latest ? null : String(value) })
                    }
                    options={revisionOptions}
                    style={{ minWidth: 200 }}
                  />
                )}
                <Segmented
                  aria-label="보기"
                  value={showDiff ? 'diff' : 'body'}
                  onChange={(value) => set({ view: value === 'diff' ? 'diff' : null })}
                  options={[
                    { value: 'body', label: '본문' },
                    { value: 'diff', label: '바뀐 곳', disabled: previous === undefined },
                  ]}
                />
              </Flex>
            ) : null}

            <Card variant="outlined">
              {showDiff && previous ? (
                <NewsDiff before={previous} after={current} />
              ) : (
                <NewsBody html={current.body} />
              )}
            </Card>
          </Flex>
        ) : null}
      </QueryState>
    </Flex>
  );
}

/** 공식 홈페이지 새소식 기록. ?id= 가 있으면 그 글 한 편, 없으면 목록이다. */
export function NewsPage() {
  const [params] = useSearchParams();
  const id = Number(params.get('id'));
  return Number.isInteger(id) && id > 0 ? <NewsPostView key={id} id={id} /> : <NewsListView />;
}
