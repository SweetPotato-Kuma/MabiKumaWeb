import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Card,
  Flex,
  Form,
  Grid,
  Input,
  Segmented,
  Select,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { QueryState } from '@/components/QueryState';
import { CloseIcon, CopyIcon, RefreshIcon, SearchIcon } from '@/components/icons';
import {
  HORN_DAYS,
  HORN_MAX_LIMIT,
  HORN_PAGE,
  canSearchHorns,
  useHornSearch,
  type HornDays,
  type HornKind,
  type HornKindFilter,
  type HornPost,
} from '@/features/horn/api';
import {
  formatHornTime,
  formatRepeats,
  highlightPattern,
  highlightTerms,
  splitHighlight,
} from '@/features/horn/terms';
import { canNotify, requestNotifyPermission, useHornAlerts } from '@/features/horn/useHornAlerts';
import { ServerSelect } from '@/components/ServerSelect';
import { type ServerName } from '@/features/servers/constants';
import { useServerParam } from '@/lib/useServerParam';

const { Title, Text } = Typography;

const KIND_OPTIONS: { value: HornKindFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'noparty', label: '파티 빼고' },
  { value: 'party', label: '파티' },
  { value: 'buy', label: '삽니다' },
  { value: 'sell', label: '팝니다' },
];

const KIND_LABELS: Record<HornKind, string | null> = {
  party: '파티',
  buy: '삽니다',
  sell: '팝니다',
  chat: null,
};

const DAY_OPTIONS = HORN_DAYS.map((days) => ({ value: days, label: `${days}일` }));

/** 검색어를 멈추고 이만큼 지나면 찾는다. 한 글자마다 워커에 묻지 않게. */
const TYPING_DELAY_MS = 350;

/** 워커가 서버를 이만큼 못 받았으면 알린다. 크론이 5분마다라 두 번 넘게 빠진 것이다. */
const STALE_MS = 12 * 60 * 1000;

function readDays(value: string | null): HornDays {
  const days = Number(value);
  return (HORN_DAYS as readonly number[]).includes(days) ? (days as HornDays) : HORN_DAYS[0];
}

function readKind(value: string | null): HornKindFilter {
  return KIND_OPTIONS.some((option) => option.value === value) ? (value as HornKindFilter) : 'all';
}

const timeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'long',
  day: 'numeric',
});

/** 검색어에 걸린 곳을 칠한다. */
function Highlighted({ text, pattern }: { text: string; pattern: RegExp | null }) {
  const { token } = theme.useToken();
  const parts = splitHighlight(text, pattern);
  return (
    <>
      {parts.map((part, index) =>
        part.hit ? (
          <mark
            key={index}
            style={{
              background: token.colorPrimaryBg,
              color: 'inherit',
              borderRadius: token.borderRadiusXS,
              padding: 0,
            }}
          >
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

interface NameCellProps {
  post: HornPost;
  pattern: RegExp | null;
  onPick: (name: string) => void;
  onCopy: (name: string) => void;
}

/** 이름을 누르면 그 캐릭터의 뿔피리만 본다. 옆 단추는 귓속말에 쓸 이름을 복사한다. */
function NameCell({ post, pattern, onPick, onCopy }: NameCellProps) {
  return (
    <Flex align="center" gap={2} style={{ minWidth: 0 }}>
      <Button
        type="link"
        size="small"
        onClick={() => onPick(post.character)}
        style={{ paddingInline: 0, height: 'auto', fontWeight: 600 }}
      >
        <Highlighted text={post.character} pattern={pattern} />
      </Button>
      <Tooltip title="이름 복사">
        <Button
          type="text"
          size="small"
          aria-label={`${post.character} 이름 복사`}
          icon={<CopyIcon />}
          onClick={() => onCopy(post.character)}
        />
      </Tooltip>
    </Flex>
  );
}

function BodyCell({ post, pattern, now }: { post: HornPost; pattern: RegExp | null; now: number }) {
  const kindLabel = KIND_LABELS[post.kind];
  const repeats = formatRepeats(post.times, post.first, now);
  const tagStyle = { marginInlineEnd: 6 } as const;
  return (
    <Flex vertical gap={2}>
      <div>
        {kindLabel ? <Tag style={tagStyle}>{kindLabel}</Tag> : null}
        {post.channel !== null ? (
          <Tag className="tnum" style={tagStyle}>
            {post.channel}채널
          </Tag>
        ) : null}
        {post.members ? (
          <Tag className="tnum" style={tagStyle}>
            {post.members}명
          </Tag>
        ) : null}
        <Highlighted text={post.body} pattern={pattern} />
      </div>
      {repeats ? (
        <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
          {repeats}
        </Text>
      ) : null}
    </Flex>
  );
}

export function HornPage() {
  const available = canSearchHorns();
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const wide = screens.md ?? true;

  const [params, setParams] = useSearchParams();
  // 서버는 주소 → 방문자의 기본 서버 순으로 정하고, 고르면 기본 서버도 따라 바뀐다.
  const [serverChoice, setServer] = useServerParam();
  const server = serverChoice as ServerName;
  const days = readDays(params.get('days'));
  const kind = readKind(params.get('kind'));
  const character = (params.get('char') ?? '').trim();
  const q = params.get('q') ?? '';
  const not = params.get('not') ?? '';

  /** 주소에 조건을 담는다. 기본값은 빼 둔다. 뒤로 가기가 조건 하나마다 걸리지 않게 바꿔 끼운다. */
  const update = useCallback(
    (changes: Record<string, string | null>) =>
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  // 입력칸은 바로 바뀌고, 찾기는 타자를 멈춘 뒤에 한다. 뒤로 가기로 주소가 바뀌면 입력칸도 따라간다.
  const [qDraft, setQDraft] = useState(q);
  const [notDraft, setNotDraft] = useState(not);
  useEffect(() => setQDraft(q), [q]);
  useEffect(() => setNotDraft(not), [not]);
  useEffect(() => {
    if (qDraft === q && notDraft === not) return;
    const timer = window.setTimeout(
      () => update({ q: qDraft.trim() ? qDraft : null, not: notDraft.trim() ? notDraft : null }),
      TYPING_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [qDraft, notDraft, q, not, update]);
  const flushTyping = () =>
    update({ q: qDraft.trim() ? qDraft : null, not: notDraft.trim() ? notDraft : null });

  // 조건이 바뀌면 줄 수는 처음으로 돌아간다.
  const filterKey = JSON.stringify([server, days, kind, character, q.trim(), not.trim()]);
  const [shown, setShown] = useState({ key: filterKey, limit: HORN_PAGE });
  const limit = shown.key === filterKey ? shown.limit : HORN_PAGE;

  const [live, setLive] = useState(true);
  const [alerts, setAlerts] = useState(false);

  const query = useHornSearch(
    { server, days, kind, q, not, character, limit },
    { live: live || alerts, background: alerts },
  );
  const data = query.data;
  const posts = useMemo(() => data?.posts ?? [], [data]);

  useHornAlerts({
    enabled: alerts,
    searchKey: filterKey,
    posts: query.isPlaceholderData ? null : (data?.posts ?? null),
    title: `뿔피리 ${server}`,
  });

  const toggleAlerts = async (next: boolean) => {
    if (!next) {
      setAlerts(false);
      return;
    }
    if (await requestNotifyPermission()) setAlerts(true);
    else message.warning('브라우저에서 이 사이트의 알림이 꺼져 있습니다.');
  };

  const pattern = useMemo(() => highlightPattern(highlightTerms(q)), [q]);

  const copyName = useCallback(
    async (name: string) => {
      try {
        await navigator.clipboard.writeText(name);
        message.success(`${name} 이름을 복사했습니다.`);
      } catch {
        message.error('이름을 복사하지 못했습니다.');
      }
    },
    [message],
  );
  const pickName = useCallback((name: string) => update({ char: name }), [update]);

  // 시각 표시의 "오늘" 은 받은 때를 기준으로 가른다. 렌더마다 시계를 읽으면 표를 매번 다시 만든다.
  const now = query.dataUpdatedAt;
  const columns = useMemo<TableColumnsType<HornPost>>(
    () =>
      wide
        ? [
            {
              title: '시각',
              key: 'last',
              width: 116,
              className: 'tnum',
              onCell: () => ({ style: { whiteSpace: 'nowrap', verticalAlign: 'top' } }),
              render: (_value, post) => formatHornTime(post.last, now),
            },
            {
              title: '캐릭터',
              key: 'character',
              width: 190,
              onCell: () => ({ style: { verticalAlign: 'top' } }),
              render: (_value, post) => (
                <NameCell post={post} pattern={pattern} onPick={pickName} onCopy={copyName} />
              ),
            },
            {
              title: '내용',
              key: 'body',
              render: (_value, post) => <BodyCell post={post} pattern={pattern} now={now} />,
            },
          ]
        : [
            {
              // 768px 미만에서는 칸을 합친다. 이름과 시각을 한 줄에, 내용을 그 아래에 둔다.
              title: '뿔피리',
              key: 'post',
              render: (_value, post) => (
                <Flex vertical gap={2}>
                  <Flex justify="space-between" align="center" gap={8}>
                    <NameCell post={post} pattern={pattern} onPick={pickName} onCopy={copyName} />
                    <Text type="secondary" className="tnum" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                      {formatHornTime(post.last, now)}
                    </Text>
                  </Flex>
                  <BodyCell post={post} pattern={pattern} now={now} />
                </Flex>
              ),
            },
          ],
    [wide, pattern, pickName, copyName, now],
  );

  const updatedAt = data?.updated ? Date.parse(data.updated) : null;
  const stale = updatedAt !== null && now - updatedAt > STALE_MS;
  const sinceAt = data?.since ? Date.parse(data.since) : null;
  const partialRange = sinceAt !== null && sinceAt > now - days * 86_400_000;
  const filtered = q.trim() !== '' || not.trim() !== '' || character !== '' || kind !== 'all';

  let footer: ReactNode = null;
  if (data?.more && limit < HORN_MAX_LIMIT) {
    footer = (
      <Button
        block
        loading={query.isFetching && query.isPlaceholderData}
        onClick={() => setShown({ key: filterKey, limit: Math.min(limit + HORN_PAGE, HORN_MAX_LIMIT) })}
      >
        {HORN_PAGE}개 더 보기
      </Button>
    );
  } else if (data?.more) {
    footer = (
      <Text type="secondary" className="tnum" style={{ fontSize: 13 }}>
        {HORN_MAX_LIMIT}개까지 보여 줍니다. 검색어나 기간으로 좁혀 보세요.
      </Text>
    );
  }

  return (
    <Flex vertical gap={20}>
      <Title level={3} style={{ margin: 0 }}>
        뿔피리 찾기
      </Title>

      {!available ? (
        <Alert
          type="warning"
          showIcon
          message="지금은 뿔피리를 찾을 수 없습니다. 조회 서버 주소가 설정되지 않았습니다."
        />
      ) : null}

      <Card variant="outlined">
        <Form layout="vertical">
          {/*
            윗줄은 고르는 것, 아랫줄은 적는 것. 768px 이상에서는 칸마다 제 폭만 차지한다. 격자로 나누면
            검색어 칸이 화면 폭을 따라 500px 가까이 늘어나 눈이 오가는 거리만 길어졌다.
            768px 미만에서는 한 단으로 쌓고 칸을 줄 폭에 맞춘다.
          */}
          <Flex vertical gap={16}>
            <Flex vertical={!wide} wrap gap={wide ? 24 : 16}>
              <Form.Item label="서버" style={{ marginBottom: 0 }}>
                <ServerSelect block={!wide} value={server} onChange={setServer} />
              </Form.Item>
              <Form.Item label="기간" style={{ marginBottom: 0 }}>
                <Segmented
                  aria-label="기간"
                  block={!wide}
                  value={days}
                  onChange={(value) => update({ days: value === HORN_DAYS[0] ? null : String(value) })}
                  options={DAY_OPTIONS}
                />
              </Form.Item>
              {/* 576px 미만에서는 다섯 칸이 한 줄에 들지 않는다. 그때는 고르기 상자다. */}
              <Form.Item
                label="분류"
                htmlFor={screens.sm === false ? 'horn-kind' : undefined}
                style={{ marginBottom: 0 }}
              >
                {screens.sm === false ? (
                  <Select
                    id="horn-kind"
                    value={kind}
                    onChange={(value: HornKindFilter) => update({ kind: value === 'all' ? null : value })}
                    options={KIND_OPTIONS}
                  />
                ) : (
                  <Segmented
                    aria-label="분류"
                    block={!wide}
                    value={kind}
                    onChange={(value) => update({ kind: value === 'all' ? null : String(value) })}
                    options={KIND_OPTIONS}
                  />
                )}
              </Form.Item>
            </Flex>
            <Flex vertical={!wide} wrap align={wide ? 'flex-end' : undefined} gap={wide ? 24 : 16}>
              <Form.Item label="검색어" htmlFor="horn-q" style={{ marginBottom: 0, width: wide ? 300 : undefined }}>
                <Input
                  id="horn-q"
                  allowClear
                  prefix={<SearchIcon />}
                  placeholder="탈라,탈가 세바"
                  value={qDraft}
                  maxLength={120}
                  onChange={(event) => setQDraft(event.target.value)}
                  onPressEnter={flushTyping}
                />
              </Form.Item>
              <Form.Item label="뺄 말" htmlFor="horn-not" style={{ marginBottom: 0, width: wide ? 220 : undefined }}>
                <Input
                  id="horn-not"
                  allowClear
                  placeholder="트라이 구함"
                  value={notDraft}
                  maxLength={120}
                  onChange={(event) => setNotDraft(event.target.value)}
                  onPressEnter={flushTyping}
                />
              </Form.Item>
              <Flex gap={20} wrap align="center" style={{ minHeight: token.controlHeight }}>
                <Flex component="label" align="center" gap={8} style={{ cursor: 'pointer' }}>
                  <Switch size="small" checked={live || alerts} disabled={alerts} onChange={setLive} />
                  <span>1분마다 새로 받기</span>
                </Flex>
                {canNotify() ? (
                  <Flex component="label" align="center" gap={8} style={{ cursor: 'pointer' }}>
                    <Switch size="small" checked={alerts} onChange={(next) => void toggleAlerts(next)} />
                    <span>새 글 알림</span>
                  </Flex>
                ) : null}
              </Flex>
            </Flex>
          </Flex>
        </Form>
      </Card>

      {stale && updatedAt !== null ? (
        <Alert
          type="warning"
          showIcon
          message={`뿔피리를 새로 받지 못하고 있습니다. ${timeFormatter.format(updatedAt)}까지 받은 글입니다.`}
        />
      ) : null}

      <Flex vertical gap={10}>
        <Flex justify="space-between" align="center" gap={12} wrap>
          <Flex align="center" gap={8} wrap>
            {/* 이름을 눌러 건 거르기. 키보드로도 풀 수 있게 진짜 단추로 둔다. */}
            {character ? (
              <Button
                size="small"
                icon={<CloseIcon />}
                iconPlacement="end"
                aria-label={`캐릭터 ${character} 거르기 풀기`}
                onClick={() => update({ char: null })}
              >
                캐릭터 {character}
              </Button>
            ) : null}
            {data ? (
              <Text className="tnum">
                {posts.length.toLocaleString('ko-KR')}개{data.more ? ' 이상' : ''}
              </Text>
            ) : null}
            {partialRange && sinceAt !== null ? (
              <Text type="secondary" style={{ fontSize: 13 }}>
                {dateFormatter.format(sinceAt)}부터 모은 글입니다.
              </Text>
            ) : null}
          </Flex>
          <Flex align="center" gap={4}>
            {updatedAt !== null ? (
              <Text type="secondary" className="tnum" style={{ fontSize: 13 }}>
                {timeFormatter.format(updatedAt)} 기준
              </Text>
            ) : null}
            <Tooltip title="지금 새로 받기">
              <Button
                type="text"
                aria-label="지금 새로 받기"
                icon={<RefreshIcon />}
                loading={query.isFetching && !query.isPlaceholderData}
                disabled={!available}
                onClick={() => void query.refetch()}
              />
            </Tooltip>
          </Flex>
        </Flex>

        <QueryState
          isLoading={available && query.isLoading}
          error={query.error}
          isEmpty={!available || (data !== undefined && posts.length === 0)}
          emptyMessage={
            !available
              ? '조회 서버가 연결되면 이곳에 뿔피리가 나옵니다.'
              : filtered
                ? '조건에 맞는 뿔피리가 없습니다. 기간을 늘리거나 검색어를 줄여 보세요.'
                : '아직 모은 뿔피리가 없습니다.'
          }
          errorAction={
            <Button size="small" onClick={() => void query.refetch()}>
              다시 찾기
            </Button>
          }
        >
          <Table<HornPost>
            columns={columns}
            dataSource={posts}
            rowKey="id"
            size="small"
            pagination={false}
            style={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}
          />
          {footer}
        </QueryState>
      </Flex>
    </Flex>
  );
}
