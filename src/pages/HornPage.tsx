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
import { KIND_BADGE_COLORS } from '@/app/theme';
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
import { useResolvedThemeMode } from '@/lib/themePreference';
import { useServerParam } from '@/lib/useServerParam';
import { updateSettings, useUserSettings } from '@/lib/userSettings';

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

/** 표의 한 줄. 같은 캐릭터의 글을 하나로 묶었을 때 나머지가 others 에 든다. */
interface HornRow {
  post: HornPost;
  others: HornPost[];
}

/**
 * 캐릭터마다 가장 최근 글 하나만 남기고 나머지는 others 로 모은다. 같은 캐릭터가 문구를 조금씩 바꿔 가며
 * 계속 외치면 완전히 같은 문구 묶기(times)로는 잡히지 않아 목록이 그 캐릭터로 채워졌다.
 * 순서는 각 캐릭터의 가장 최근 글이 처음 나온 자리를 따른다.
 */
function groupByCharacter(posts: HornPost[]): HornRow[] {
  const rows = new Map<string, HornRow>();
  for (const post of posts) {
    const row = rows.get(post.character);
    if (!row) {
      rows.set(post.character, { post, others: [] });
    } else if (post.last > row.post.last) {
      row.others.push(row.post);
      row.post = post;
    } else {
      row.others.push(post);
    }
  }
  return [...rows.values()].map((row) => ({
    post: row.post,
    others: row.others.sort((a, b) => b.last - a.last),
  }));
}

/** 인원이 가득 찬 파티인지. "4/4" 처럼 온다. */
function isFull(members: string | null): boolean {
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec(members ?? '');
  return match !== null && Number(match[2]) > 0 && Number(match[1]) >= Number(match[2]);
}

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
  /** 같은 캐릭터의 다른 글. 있으면 "외 N건" 으로 펼치거나 접는다. */
  more?: { count: number; open: boolean; onToggle: () => void };
}

/** 이름을 누르면 그 캐릭터의 뿔피리만 본다. 옆 단추는 귓속말에 쓸 이름을 복사한다. */
function NameCell({ post, pattern, onPick, onCopy, more }: NameCellProps) {
  return (
    <Flex align="center" gap={2} style={{ minWidth: 0 }} wrap>
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
      {more ? (
        <Button
          type="link"
          size="small"
          aria-expanded={more.open}
          aria-label={`${post.character} 다른 글 ${more.count}건 ${more.open ? '접기' : '펼치기'}`}
          onClick={more.onToggle}
          style={{ paddingInline: 4 }}
        >
          외 {more.count}건 {more.open ? '접기' : '보기'}
        </Button>
      ) : null}
    </Flex>
  );
}

function BodyCell({ post, pattern, now }: { post: HornPost; pattern: RegExp | null; now: number }) {
  const mode = useResolvedThemeMode();
  const kindLabel = KIND_LABELS[post.kind];
  const kindColors = post.kind === 'chat' ? null : KIND_BADGE_COLORS[mode][post.kind];
  const repeats = formatRepeats(post.times, post.first, now);
  const tagStyle = { marginInlineEnd: 6 } as const;
  return (
    // 인원이 다 찬 파티는 들어갈 수 없으니 흐리게 둔다.
    <Flex vertical gap={2} style={{ opacity: post.kind === 'party' && isFull(post.members) ? 0.55 : undefined }}>
      <div>
        {kindLabel ? (
          <Tag
            variant="filled"
            style={{ ...tagStyle, background: kindColors?.background, color: kindColors?.text }}
          >
            {kindLabel}
          </Tag>
        ) : null}
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

  // 캐릭터당 최신 1건만. 주소가 있으면 그것이, 없으면 마지막에 고른 값(설정)이 처음 값이다.
  const [userSettings] = useUserSettings();
  const latestParam = params.get('latest');
  const latestOnly = latestParam === null ? userSettings.hornLatestOnly : latestParam === '1';
  const setLatestOnly = (next: boolean) => {
    update({ latest: next ? '1' : '0' });
    updateSettings({ hornLatestOnly: next });
  };
  const [expanded, setExpanded] = useState<string[]>([]);
  const toggleExpanded = useCallback(
    (name: string) => setExpanded((prev) => (prev.includes(name) ? prev.filter((each) => each !== name) : [...prev, name])),
    [],
  );

  const [live, setLive] = useState(true);
  const [alerts, setAlerts] = useState(false);

  const query = useHornSearch(
    { server, days, kind, q, not, character, limit },
    { live: live || alerts, background: alerts },
  );
  const data = query.data;
  const posts = useMemo(() => data?.posts ?? [], [data]);
  const rows = useMemo<HornRow[]>(
    () => (latestOnly ? groupByCharacter(posts) : posts.map((post) => ({ post, others: [] }))),
    [latestOnly, posts],
  );

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
  const columns = useMemo<TableColumnsType<HornRow>>(
    () => {
      const nameOf = ({ post, others }: HornRow) => (
        <NameCell
          post={post}
          pattern={pattern}
          onPick={pickName}
          onCopy={copyName}
          more={
            others.length > 0
              ? { count: others.length, open: expanded.includes(post.character), onToggle: () => toggleExpanded(post.character) }
              : undefined
          }
        />
      );
      return wide
        ? [
            {
              title: '시각',
              key: 'last',
              width: 116,
              className: 'tnum',
              onCell: () => ({ style: { whiteSpace: 'nowrap', verticalAlign: 'top' } }),
              render: (_value, row) => formatHornTime(row.post.last, now),
            },
            {
              title: '캐릭터',
              key: 'character',
              width: 210,
              onCell: () => ({ style: { verticalAlign: 'top' } }),
              render: (_value, row) => nameOf(row),
            },
            {
              title: '내용',
              key: 'body',
              render: (_value, row) => <BodyCell post={row.post} pattern={pattern} now={now} />,
            },
          ]
        : [
            {
              // 768px 미만에서는 칸을 합친다. 이름과 시각을 한 줄에, 내용을 그 아래에 둔다.
              title: '뿔피리',
              key: 'post',
              render: (_value, row) => (
                <Flex vertical gap={2}>
                  <Flex justify="space-between" align="center" gap={8}>
                    {nameOf(row)}
                    <Text type="secondary" className="tnum" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                      {formatHornTime(row.post.last, now)}
                    </Text>
                  </Flex>
                  <BodyCell post={row.post} pattern={pattern} now={now} />
                </Flex>
              ),
            },
          ];
    },
    [wide, pattern, pickName, copyName, now, expanded, toggleExpanded],
  );

  /** 펼친 캐릭터의 다른 글. 시각과 내용을 줄마다 적는다. */
  const otherPosts = (row: HornRow) => (
    <Flex vertical gap={8} style={{ paddingInlineStart: wide ? 116 + 16 : 0 }}>
      {row.others.map((post) => (
        <Flex key={post.id} gap={12} align="flex-start">
          <Text type="secondary" className="tnum" style={{ fontSize: 13, whiteSpace: 'nowrap', minWidth: 48 }}>
            {formatHornTime(post.last, now)}
          </Text>
          <BodyCell post={post} pattern={pattern} now={now} />
        </Flex>
      ))}
    </Flex>
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
              <Form.Item label="제외 단어" htmlFor="horn-not" style={{ marginBottom: 0, width: wide ? 220 : undefined }}>
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
                <Flex component="label" align="center" gap={8} style={{ cursor: 'pointer' }}>
                  <Switch size="small" checked={latestOnly} onChange={setLatestOnly} />
                  <span>캐릭터당 최신 1건만</span>
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
                {/* 전체 건수를 알 수 없으면(더 있음) 지금 보여 주는 범위만 말한다. */}
                {data.more
                  ? `최근 ${posts.length.toLocaleString('ko-KR')}건 표시 중`
                  : `${posts.length.toLocaleString('ko-KR')}건`}
                {latestOnly && rows.length < posts.length ? ` · 캐릭터 ${rows.length.toLocaleString('ko-KR')}명` : ''}
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
          <Table<HornRow>
            columns={columns}
            dataSource={rows}
            rowKey={(row) => row.post.id}
            expandable={{
              expandedRowKeys: rows.filter((row) => expanded.includes(row.post.character)).map((row) => row.post.id),
              expandedRowRender: otherPosts,
              rowExpandable: (row) => row.others.length > 0,
              showExpandColumn: false,
            }}
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
