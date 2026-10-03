import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  App,
  AutoComplete,
  Button,
  Card,
  Checkbox,
  Collapse,
  Flex,
  Grid,
  Input,
  InputNumber,
  Segmented,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd';
import { CopyIcon, HelpIcon, LinkIcon } from '@/components/icons';
import { NameSuggestionLabel } from '@/components/NameSuggestionLabel';
import { useItemNameIndexQuery, searchNames } from '@/features/auction/nameIndex';
import type {
  CalcResult,
  CalcRow,
  CalculatorDef,
  Cell,
  Field,
  GoldField,
  Values,
} from '@/features/calculators/schema';
import { useItemQuotes, type QuoteBasis } from '@/features/calculators/quotes';
import { remember, withRemembered } from '@/features/calculators/remembered';
import { readValues, writeValues } from '@/features/calculators/url';
import { headerHeightFor } from '@/app/theme';
import { formatGoldWith, formatKoreanReading } from '@/lib/format';
import { useGoldFormatter } from '@/lib/useGoldFormatter';
import { snapshotAgeLabel } from '@/features/auction/snapshot';

const { Text, Title } = Typography;

/** 입력이 멈춘 뒤 주소를 고치기까지 기다리는 시간. */
const URL_WRITE_DELAY_MS = 300;

/** 자동완성에 보여 줄 개수. */
const SUGGESTION_LIMIT = 20;

/** 큰 금액을 읽기 좋게 끊는다. "123456789" → "123,456,789". */
const groupDigits = (value: string | undefined) =>
  value === undefined ? '' : value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 빠른 증가 단추의 이름. 설정과 상관없이 억, 만으로 적어야 "+1억" 처럼 짧다. */
function quickLabel(amount: number): string {
  return `+${formatGoldWith(amount, { style: 'korean', omitSmall: false }, false)}`;
}

/** 골드 금액 칸. 빠른 증가 단추가 있고, 시세 자동 채움 칸은 비워 두면 시세를 쓴다. */
function GoldInput({
  field,
  value,
  onChange,
  autoQuote,
}: {
  field: GoldField;
  value: number | null;
  onChange: (value: number | null) => void;
  /** 자동 채움에 쓸 시세. 없거나 받는 중이면 null. */
  autoQuote: number | null;
}) {
  const formatGold = useGoldFormatter();
  const id = `calc-${field.key}`;
  return (
    <Flex vertical gap={6}>
      <Flex gap={6} align="baseline" wrap>
        <label htmlFor={id}>
          <Text>{field.label}</Text>
        </label>
        {value !== null && value >= 10_000 ? (
          <Text type="secondary" className="tnum" style={{ fontSize: 13 }}>
            ({formatKoreanReading(value)})
          </Text>
        ) : null}
      </Flex>
      <InputNumber<number>
        id={id}
        min={0}
        precision={0}
        controls={false}
        value={value}
        onChange={(next) => onChange(next)}
        formatter={(raw) => groupDigits(raw === undefined ? undefined : String(raw))}
        parser={(text) => Number((text ?? '').replace(/,/g, ''))}
        placeholder={field.autoFill ? (autoQuote === null ? '시세 없음' : `시세 ${formatGold(autoQuote)}`) : undefined}
        suffix="G"
        className="tnum"
        style={{ width: '100%' }}
      />
      {field.autoFill && value !== null ? (
        <Button size="small" type="link" style={{ alignSelf: 'flex-start', paddingInline: 0 }} onClick={() => onChange(null)}>
          시세로 되돌리기
        </Button>
      ) : null}
      {field.quick && field.quick.length > 0 ? (
        <Flex gap={6} wrap>
          {field.quick.map((amount) => (
            <Button
              key={amount}
              size="small"
              onClick={() => onChange((value ?? autoQuote ?? 0) + amount)}
              aria-label={`${field.label} ${quickLabel(amount)}`}
            >
              {quickLabel(amount)}
            </Button>
          ))}
          <Button size="small" type="text" onClick={() => onChange(field.autoFill ? null : (field.default ?? 0))}>
            초기화
          </Button>
        </Flex>
      ) : null}
      {field.hint ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {field.hint}
        </Text>
      ) : null}
    </Flex>
  );
}

/** 아이템 이름 칸. 아이템 정보와 같은 초성 검색 자동완성을 쓴다. */
function ItemInput({
  field,
  value,
  onChange,
}: {
  field: Extract<Field, { type: 'item' }>;
  value: string;
  onChange: (value: string) => void;
}) {
  const index = useItemNameIndexQuery().data;
  const options = useMemo(
    () =>
      index && value.trim()
        ? searchNames(index, value, { limit: SUGGESTION_LIMIT }).map((item) => ({
            value: item.name,
            label: <NameSuggestionLabel item={item} showCategory />,
          }))
        : [],
    [index, value],
  );
  const id = `calc-${field.key}`;
  return (
    <Flex vertical gap={6}>
      <label htmlFor={id}>
        <Text>{field.label}</Text>
      </label>
      <AutoComplete id={id} value={value} options={options} onChange={onChange} style={{ width: '100%' }}>
        <Input placeholder="예: 숏 소드, ㅅㅅㄷ" allowClear />
      </AutoComplete>
    </Flex>
  );
}

function FieldInput({
  field,
  values,
  setValue,
  autoQuote,
}: {
  field: Field;
  values: Values;
  setValue: (key: string, value: Values[string]) => void;
  autoQuote: number | null;
}) {
  const id = `calc-${field.key}`;
  switch (field.type) {
    case 'gold':
      return (
        <GoldInput
          field={field}
          value={typeof values[field.key] === 'number' ? (values[field.key] as number) : null}
          onChange={(next) => setValue(field.key, next)}
          autoQuote={autoQuote}
        />
      );
    case 'number':
      return (
        <Flex vertical gap={6}>
          <label htmlFor={id}>
            <Text>{field.label}</Text>
          </label>
          <InputNumber<number>
            id={id}
            min={field.min}
            max={field.max}
            precision={0}
            value={values[field.key] as number}
            onChange={(next) => setValue(field.key, next ?? field.default)}
            suffix={field.suffix}
            className="tnum"
            style={{ width: 160 }}
          />
        </Flex>
      );
    case 'toggle':
      return (
        <Checkbox checked={values[field.key] === true} onChange={(event) => setValue(field.key, event.target.checked)}>
          {field.label}
        </Checkbox>
      );
    case 'choice':
      return (
        <Flex vertical gap={6}>
          <Text>{field.label}</Text>
          <Segmented
            aria-label={field.label}
            options={[...field.options]}
            value={String(values[field.key])}
            onChange={(next) => setValue(field.key, String(next))}
          />
        </Flex>
      );
    case 'item':
      return <ItemInput field={field} value={String(values[field.key] ?? '')} onChange={(next) => setValue(field.key, next)} />;
  }
}

/** 결과의 한 줄을 글로. */
function rowText(row: CalcRow, formatGold: (value: number | null | undefined) => string): string {
  if (row.text !== undefined) return row.text;
  return row.gold === undefined || row.gold === null ? '-' : formatGold(row.gold);
}

/** 표의 칸을 글로. 금액 구간은 "1,000 G ~ 2,000 G", 위가 열려 있으면 "1,000 G 이상". */
function cellText(cell: Cell, formatGold: (value: number | null | undefined) => string): string {
  if (typeof cell === 'string') return cell;
  if ('goldRange' in cell) {
    const [from, to] = cell.goldRange;
    return to === null ? `${formatGold(from)} 이상` : `${formatGold(from)} ~ ${formatGold(to)}`;
  }
  return cell.gold === null ? '-' : formatGold(cell.gold);
}

/** 핵심 숫자. 큰 글씨로 보인다. */
function Headline({ rows, compact = false }: { rows: CalcRow[]; compact?: boolean }) {
  const formatGold = useGoldFormatter();
  const { token } = theme.useToken();
  return (
    <Flex vertical={!compact} gap={compact ? 16 : 10} wrap>
      {rows.map((row) => (
        <Flex key={row.label} vertical gap={0}>
          <Text type="secondary" style={{ fontSize: compact ? 11 : 13 }}>
            {row.label}
          </Text>
          <Text
            strong
            className="tnum"
            style={{
              fontSize: compact ? 15 : row.strong ? 28 : 20,
              color: row.strong ? token.colorPrimary : undefined,
              whiteSpace: 'nowrap',
            }}
          >
            {rowText(row, formatGold)}
          </Text>
        </Flex>
      ))}
    </Flex>
  );
}

/** 결과 카드. 핵심 숫자, 계산식 도움말, 접는 상세, 복사와 공유 링크. */
function ResultPanel({ result, title }: { result: CalcResult; title: string }) {
  const formatGold = useGoldFormatter();
  const { token } = theme.useToken();
  const { message } = App.useApp();

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(done);
    } catch {
      message.error('복사하지 못했습니다.');
    }
  };

  const resultText = [
    title,
    ...result.headline.map((row) => `${row.label}: ${rowText(row, formatGold)}`),
    ...(result.details ?? []).map((row) => `${row.label}: ${rowText(row, formatGold)}`),
  ].join('\n');

  const detailChildren = (
    <Flex vertical gap={12}>
      {result.table ? (
        <Table
          size="small"
          pagination={false}
          scroll={{ x: 'max-content' }}
          rowKey={(_row, index) => String(index)}
          columns={result.table.columns.map((column, columnIndex) => ({
            title: column,
            key: column,
            align: columnIndex === 0 ? ('left' as const) : ('right' as const),
            onCell: (_row: Cell[], index?: number) => ({
              style: index === result.table?.highlight ? { background: token.colorPrimaryBg } : undefined,
            }),
            render: (_value: unknown, row: Cell[]) => (
              <span className="tnum" style={{ whiteSpace: 'nowrap' }}>
                {cellText(row[columnIndex], formatGold)}
              </span>
            ),
          }))}
          dataSource={result.table.rows.map((row) => row)}
          onRow={(_row, index) => ({
            style: index === result.table?.highlight ? { fontWeight: 600 } : undefined,
          })}
        />
      ) : null}
      {(result.details ?? []).map((row) => (
        <Flex key={row.label} justify="space-between" gap={12}>
          <Text type="secondary">{row.label}</Text>
          <Text className="tnum">{rowText(row, formatGold)}</Text>
        </Flex>
      ))}
    </Flex>
  );

  return (
    <Card variant="outlined" aria-label="계산 결과" role="region">
      <Flex vertical gap={14}>
        <Flex justify="space-between" align="center" gap={8}>
          <Title level={5} style={{ margin: 0 }}>
            결과
          </Title>
          <Tooltip title={<div style={{ fontSize: 12, maxWidth: 300 }}>{result.formula}</div>}>
            <span
              tabIndex={0}
              role="img"
              aria-label={`계산식: ${result.formula}`}
              style={{ display: 'inline-flex', fontSize: 16, cursor: 'help' }}
            >
              <Text type="secondary" style={{ display: 'inline-flex' }}>
                <HelpIcon />
              </Text>
            </span>
          </Tooltip>
        </Flex>

        <Headline rows={result.headline} />

        {result.table || (result.details && result.details.length > 0) ? (
          <Collapse
            size="small"
            items={[{ key: 'detail', label: '상세 내역', children: detailChildren }]}
          />
        ) : null}

        {result.notes && result.notes.length > 0 ? (
          <Flex vertical gap={2}>
            {result.notes.map((note) => (
              <Text key={note} type="secondary" style={{ fontSize: 12 }}>
                {note}
              </Text>
            ))}
          </Flex>
        ) : null}

        <Flex gap={8} wrap>
          <Button icon={<CopyIcon />} onClick={() => void copy(resultText, '결과를 복사했습니다.')}>
            결과 복사
          </Button>
          <Button icon={<LinkIcon />} onClick={() => void copy(window.location.href, '공유 링크를 복사했습니다.')}>
            공유 링크
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
}

/**
 * 계산기 한 화면. 스키마(fields)와 계산 함수(compute)만 받아 입력, 시세 자동 채움, 결과를 그린다.
 *
 * 데스크톱은 왼쪽에 입력, 오른쪽에 결과이고 결과는 스크롤해도 따라온다. 모바일은 입력 다음에 결과이고 핵심
 * 숫자는 화면 아래에 고정한 바에도 보인다. 입력은 주소에 담겨 공유 링크가 같은 결과를 다시 만든다.
 */
export function CalculatorView({ def }: { def: CalculatorDef }) {
  const screens = Grid.useBreakpoint();
  const wide = Boolean(screens.md);
  const { token } = theme.useToken();

  const [params, setParams] = useSearchParams();
  // 주소의 값이 먼저이고, 주소에 없는 기억 칸(직접 넣은 쿠폰 값, 멤버십 등)은 이 브라우저에 남긴 값으로 채운다.
  const [values, setValues] = useState<Values>(() =>
    withRemembered(def.id, def.fields, readValues(def.fields, params), params),
  );
  const basis: QuoteBasis = params.get('basis') === 'mid' ? 'mid' : 'lowest';

  // 입력은 바로 바뀌고 주소는 잠깐 멈춘 뒤에 따라간다. 뒤로 가기 단계가 글자마다 쌓이지 않게 바꿔 끼운다.
  const valuesRef = useRef(values);
  valuesRef.current = values;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setParams((previous) => writeValues(def.fields, valuesRef.current, previous), { replace: true });
    }, URL_WRITE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [values, def.fields, setParams]);

  // 사용자가 직접 고칠 때만 기억 칸을 저장한다. 링크를 열었다고 내 설정을 바꾸지 않는다.
  const setValue = useCallback(
    (key: string, value: Values[string]) => {
      const next = { ...valuesRef.current, [key]: value };
      valuesRef.current = next;
      setValues(next);
      remember(def.id, def.fields, next);
    },
    [def.id, def.fields],
  );

  const names = useMemo(() => def.quoteNames?.(values) ?? [], [def, values]);
  const { quote, loading, asOf } = useItemQuotes(names, basis);
  const result = useMemo(() => def.compute(values, { quote }), [def, values, quote]);

  const setBasis = (next: QuoteBasis) =>
    setParams(
      (previous) => {
        const nextParams = new URLSearchParams(previous);
        if (next === 'mid') nextParams.set('basis', 'mid');
        else nextParams.delete('basis');
        return nextParams;
      },
      { replace: true },
    );

  const hasQuotes = names.length > 0;

  const inputs = (
    <Card variant="outlined" title="입력">
      <Flex vertical gap={16}>
        {hasQuotes ? (
          <Flex gap={10} align="center" wrap>
            <Segmented
              size="small"
              aria-label="시세 기준"
              value={basis}
              onChange={(next) => setBasis(next as QuoteBasis)}
              options={[
                { value: 'lowest', label: '경매장 최저가' },
                { value: 'mid', label: '1일 중위' },
              ]}
            />
            <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
              {loading ? '시세를 받는 중입니다.' : asOf === null ? '시세 없음' : `${snapshotAgeLabel(asOf)} 시세`}
            </Text>
          </Flex>
        ) : null}
        {def.fields.map((field) => (
          <FieldInput
            key={field.key}
            field={field}
            values={values}
            setValue={setValue}
            autoQuote={field.type === 'gold' && field.autoFill ? quote(field.autoFill) : null}
          />
        ))}
      </Flex>
    </Card>
  );

  const resultPanel = <ResultPanel result={result} title={def.title} />;

  return (
    <Flex vertical gap={16} style={{ paddingBottom: wide ? 0 : 88 }}>
      <Flex vertical gap={4}>
        <Title level={3} style={{ margin: 0 }}>
          {def.title} 계산기
        </Title>
        <Text type="secondary">{def.summary}</Text>
      </Flex>

      {def.related && def.related.length > 0 ? (
        <Flex gap={8} align="center" wrap>
          <Text type="secondary" style={{ fontSize: 13 }}>
            관련
          </Text>
          {def.related.map((link) => (
            <Link key={link.to} to={link.to}>
              <Tag style={{ marginInlineEnd: 0, cursor: 'pointer' }}>{link.label}</Tag>
            </Link>
          ))}
          <Link to="/calculators">
            <Tag style={{ marginInlineEnd: 0, cursor: 'pointer' }}>다른 계산기</Tag>
          </Link>
        </Flex>
      ) : null}

      <Flex gap={16} align="flex-start" vertical={!wide}>
        <div style={{ flex: wide ? '1 1 0' : undefined, minWidth: 0, width: wide ? undefined : '100%' }}>{inputs}</div>
        <div
          style={{
            flex: wide ? '1 1 0' : undefined,
            minWidth: 0,
            width: wide ? undefined : '100%',
            // 스크롤해도 결과가 따라온다. 헤더 바로 아래에 붙는다.
            position: wide ? 'sticky' : undefined,
            top: wide ? headerHeightFor(screens) + 16 : undefined,
          }}
        >
          {resultPanel}
        </div>
      </Flex>

      {/* 모바일은 결과가 입력 아래에 있어 스크롤하면 안 보인다. 핵심 숫자를 화면 아래에 고정해 둔다. */}
      {wide ? null : (
        <div
          role="status"
          aria-label="핵심 결과"
          style={{
            position: 'fixed',
            insetInline: 0,
            bottom: 0,
            zIndex: 9,
            padding: '8px 16px',
            background: token.colorBgElevated,
            borderTop: `1px solid ${token.colorBorderSecondary}`,
            boxShadow: token.boxShadowTertiary,
          }}
        >
          <Headline rows={result.headline} compact />
        </div>
      )}
    </Flex>
  );
}
