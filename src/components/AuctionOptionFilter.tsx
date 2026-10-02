import { useMemo, useState } from 'react';
import { AutoComplete, Button, Card, Flex, Select, Tag, Typography } from 'antd';
import { ColorChannelFields } from '@/components/ColorChannelFields';
import { AddIcon, DeleteIcon, SearchIcon } from '@/components/icons';
import { normalizeForSearch } from '@/features/auction/dictionary';
import { offeredKinds } from '@/features/auction/optionKinds';
import {
  COLOR_OPTION_LABEL,
  conditionLabel,
  ENCHANT_PREFIX,
  ENCHANT_SUFFIX,
  isConditionActive,
  newCondition,
  numberLabel,
  PET_FIELDS,
  PET_QUICK_CONDITION,
  PET_SPECIES_FIELD,
  QUICK_CONDITIONS,
  RELIC_QUICK_CONDITION,
  summarizeCondition,
  thresholdSuggestions,
  type CatalogEntry,
  type Condition,
  type ConditionKind,
  type OptionFilter,
} from '@/features/auction/optionFilter';
import {
  reforgeCap,
  reforgeLevelSuggestions,
  type LevelSuggestion,
  type OptionNames,
} from '@/features/auction/optionNames';
import {
  formatRelicValue,
  RELIC_LEVELS,
  relicValueAt,
} from '@/features/relics/murias';
import { formatNumber } from '@/lib/format';

const { Text } = Typography;

const PART_OPTIONS = [
  { value: '', label: '아무 파트' },
  ...['A', 'B', 'C', 'D', 'E', 'F'].map((part) => ({ value: part, label: `파트 ${part}` })),
];

const SPECIAL_OPTIONS = [
  { value: '', label: 'R, S 아무거나' },
  { value: 'R', label: 'R (레드)' },
  { value: 'S', label: 'S (실버)' },
];

/**
 * 작은 창(Popover) 안의 목록을 창 안에 그린다. 바깥(body)에 그리면 목록을 누르는 순간 창이
 * "바깥을 눌렀다" 고 보고 닫힌다. 상세 검색 창(Modal)에서는 body 에 그려도 닫히지 않는다.
 */
const inPopover = (trigger: HTMLElement): HTMLElement =>
  trigger.closest<HTMLElement>('.ant-popover') ?? document.body;

/** 자동완성 목록에 한 번에 보여 줄 이름 수. 더 좁히려면 글자를 친다. */
const NAME_SUGGESTION_LIMIT = 50;

/** 숫자 칸 폭. "22" 와 지우기 단추, 자리 글 "레벨 이상" 이 드는 폭이다. */
const NUMBER_INPUT_WIDTH = 112;

/** 옆에 숫자 칸을 둘 때 이름 칸의 최소 폭. "컴뱃 마스터리 최대 대미지" 와 지우기 단추가 드는 폭이다. */
const NAME_INPUT_MIN = 200;

/**
 * 이름 자동완성 목록의 폭. 입력칸보다 좁아지지 않고, 긴 이름("1막: 우연한 충돌 대미지 배율")은
 * 이 폭까지 늘어난 뒤 줄을 바꾼다. 입력칸 폭에 묶어 두면 이름 끝이 잘려 무엇인지 알 수 없었다.
 */
const NAME_POPUP_STYLE = { maxWidth: 'min(360px, calc(100vw - 32px))' } as const;

/**
 * 창 안 입력 줄의 칸 나누기. 이름 칸은 남는 폭을 다 쓰되 0 까지 줄어들 수 있어야 한다.
 * flex 로 두면 이름 칸이 자리 글 길이 밑으로 줄지 못해 숫자 칸과 빼기 단추가 창 밖으로 밀렸다.
 */
const rowGrid = (columns: string) =>
  ({ display: 'grid', gridTemplateColumns: columns, gap: 6, alignItems: 'center' }) as const;

/** 세공 조건은 세 줄까지. 장비의 세공 옵션이 최대 세 줄이다. */
const MAX_REFORGE_CONDITIONS = 3;

/**
 * 불러온 매물이 없어 셀 수 없을 때 숫자 칸에 보여 줄 값. 자주 찾는 기준값이다.
 * 매물을 불러오면 실제 값과 건수로 바뀐다.
 */
const DEFAULT_THRESHOLDS: Partial<Record<ConditionKind, number[]>> = {
  reforge: [20, 18, 15, 10, 5],
  special: [7, 6, 5, 4, 3, 2, 1],
  erg: [50, 45, 40, 35, 30, 25, 20],
};

/** 자동완성 한 줄. 불러온 매물에서 나온 이름은 건수가 있고, 게임 데이터에서 온 이름은 없다. */
interface Suggestion {
  value: string;
  count?: number;
}

/**
 * 불러온 매물의 이름(많이 나온 순)을 먼저, 게임 데이터의 이름을 그 뒤에 붙인다.
 * 매물을 불러오기 전에도 자동완성이 비지 않게 하려는 것이다.
 */
function mergeNames(
  loaded: { value: string; count: number }[] | undefined,
  known: string[] | undefined,
): Suggestion[] {
  const seen = new Set((loaded ?? []).map((each) => each.value));
  return [
    ...(loaded ?? []),
    ...(known ?? []).filter((name) => !seen.has(name)).map((value) => ({ value })),
  ];
}

/** 창 안에서 한 칸이 맡는 조건 묶음. 자주 쓰는 옵션은 종류별로, 그 밖의 옵션은 조건마다 하나. */
type GroupKey = ConditionKind | `extra:${number}`;

const groupOf = (condition: Condition): GroupKey =>
  condition.kind === 'number' || condition.kind === 'text'
    ? `extra:${condition.id}`
    : condition.kind;

/** 자주 쓰는 옵션 전부. 어떤 것을 둘지는 카테고리가 정한다(offeredKinds). */
const ALL_QUICK_CONDITIONS = [RELIC_QUICK_CONDITION, ...QUICK_CONDITIONS, PET_QUICK_CONDITION];
const ALL_QUICK_KINDS = new Set<ConditionKind>(ALL_QUICK_CONDITIONS.map((quick) => quick.kind));

/** 한 칸 안에 줄을 여러 개 둘 수 있는 옵션과 그 상한. 장비의 세공이 최대 세 줄이다. */
const MAX_ROWS: Partial<Record<ConditionKind, number>> = { reforge: MAX_REFORGE_CONDITIONS, pet: 6 };

const ROW_ADD_LABEL: Partial<Record<ConditionKind, string>> = { reforge: '세공 조건 추가', pet: '펫 조건 추가' };

/**
 * 건 조건을 배지로 요약한다. 상세 검색 패널이 닫혀 있어도(카테고리 탭, 좁은 화면) 어떤 조건이 걸려 있는지 보이고, 하나씩
 * 빼거나 모두 지울 수 있다. 걸린 조건이 없으면 아무것도 그리지 않는다.
 */
export function DetailConditionBadges({
  value,
  onChange,
  onOpen,
}: {
  value: OptionFilter;
  onChange: (next: OptionFilter) => void;
  /** 배지를 눌렀을 때. 상세 검색 패널을 연다. */
  onOpen: () => void;
}) {
  const active = value.conditions.filter(isConditionActive);
  if (active.length === 0) return null;
  return (
    <Flex gap={6} wrap align="center">
      <Text strong style={{ fontSize: 13, marginInlineEnd: 2 }}>
        상세 검색
      </Text>
      {active.map((condition) => (
        <Tag
          key={condition.id}
          closable
          onClose={() => onChange({ conditions: value.conditions.filter((each) => each.id !== condition.id) })}
          onClick={onOpen}
          style={{ marginInlineEnd: 0, cursor: 'pointer' }}
          color="processing"
        >
          {summarizeCondition(condition)}
        </Tag>
      ))}
      <Button size="small" type="link" onClick={() => onChange({ conditions: [] })}>
        조건 모두 지우기
      </Button>
    </Flex>
  );
}

/**
 * 경매장 상세 검색 패널. 옵션마다 칸이 세로로 쌓이고, 칸마다 값을 넣는다. 아래 단추로 옵션 칸을 더한다.
 *
 * 인게임 경매장처럼 결과 옆(왼쪽 카테고리 칸의 탭, 좁은 화면은 아래에서 올라오는 시트)에 두고, 고치는 대로 바로 적용한다.
 * 넥슨 경매장 API 는 옵션으로 찾지 못해 불러온 매물을 이 조건으로 거르므로, 불러온 결과는 값을 넣는 대로 바뀐다. 아직 불러오지
 * 않은 카테고리를 훑을 때는 아래 검색 단추로 조건을 주소에 확정해 찾는다. 모달로 열었을 때는 열려 있는 동안 결과가 가려져
 * 조건이 결과를 어떻게 바꾸는지 볼 수 없었다.
 *
 * 자동완성은 불러온 매물의 이름과 값을 먼저, 게임 데이터의 이름을 그 뒤에 보여 준다.
 */
export function DetailOptionsPanel({
  value,
  onChange,
  onSearch,
  catalog,
  names,
  category,
}: {
  value: OptionFilter;
  /** 고치는 대로 부른다. 값이 빈 조건 칸도 들어 있다(고르기만 하고 아직 값을 넣지 않은 것). */
  onChange: (next: OptionFilter) => void;
  /** 검색 단추. 값을 넣은 조건만 넘겨 그 조건으로 찾는다. */
  onSearch: (next: OptionFilter) => void;
  catalog: CatalogEntry[];
  names: OptionNames | null | undefined;
  /** 고른 카테고리. 어떤 옵션을 둘지와, 한손 장비, 액세서리의 세공 최대 레벨(레벨 자동완성)에 쓴다. */
  category: string;
}) {
  const draft = value.conditions;
  const setDraft = (next: Condition[]) => onChange({ conditions: next });

  const update = (id: number, next: Partial<Condition>) =>
    setDraft(draft.map((condition) => (condition.id === id ? ({ ...condition, ...next } as Condition) : condition)));
  const removeOne = (id: number) => setDraft(draft.filter((condition) => condition.id !== id));
  const removeGroup = (group: GroupKey) => setDraft(draft.filter((condition) => groupOf(condition) !== group));

  // 카테고리에 붙는 옵션만 더하게 한다. 무리아스 유물에 세공은 쓸모가 없다.
  const offered = offeredKinds(
    category,
    catalog.map((entry) => entry.kind),
    draft.map((condition) => condition.kind),
  );
  const quickConditions = ALL_QUICK_CONDITIONS.filter((quick) => offered.includes(quick.kind));

  // 칸의 순서: 자주 쓰는 옵션은 위 목록 순서대로, 그 밖의 옵션은 더한 순서대로.
  const groups: GroupKey[] = [
    ...quickConditions.map((quick) => quick.kind).filter((kind) => draft.some((condition) => condition.kind === kind)),
    ...draft.filter((condition) => condition.kind === 'number' || condition.kind === 'text').map(groupOf),
  ];
  const addable = quickConditions.filter((quick) => !draft.some((condition) => condition.kind === quick.kind));
  const usedExtras = new Set(
    draft.flatMap((condition) =>
      condition.kind === 'number' || condition.kind === 'text' ? [condition.optionType] : [],
    ),
  );
  const extraOptions = catalog
    .filter((entry) => !ALL_QUICK_KINDS.has(entry.kind) && !usedExtras.has(entry.optionType))
    .map((entry) => ({ value: entry.label, label: entry.label, count: entry.count }));

  const add = (entry: Pick<CatalogEntry, 'kind' | 'optionType'>) => {
    const condition = newCondition(entry);
    if (condition.kind === 'pet') {
      // 줄을 더할 때는 아직 쓰지 않은 항목으로 시작한다. 같은 항목을 두 번 걸 일은 드물다.
      const used = new Set(draft.flatMap((each) => (each.kind === 'pet' ? [each.field] : [])));
      condition.field = PET_FIELDS.find((field) => !used.has(field)) ?? condition.field;
    }
    setDraft([...draft, condition]);
  };

  const editorFor = (condition: Condition) => (
    <ConditionEditor
      condition={condition}
      entry={entryFor(catalog, condition)}
      names={names}
      category={category}
      onChange={(next) => update(condition.id, next)}
    />
  );

  const blockOf = (group: GroupKey) => {
    const conditions = draft.filter((condition) => groupOf(condition) === group);
    const first = conditions[0];
    const label = conditionLabel(first);
    const cap = MAX_ROWS[first.kind];
    return (
      <Card
        key={group}
        size="small"
        title={label}
        extra={
          <Button
            type="text"
            size="small"
            icon={<DeleteIcon />}
            aria-label={`${label} 옵션 삭제`}
            onClick={() => removeGroup(group)}
          />
        }
      >
        <Flex vertical gap={10}>
          {conditions.map((condition) =>
            cap !== undefined && conditions.length > 1 ? (
              // 빼기 단추는 입력칸과 같은 높이(기본 크기)로 두어 한 줄 가운데에 선다.
              <div key={condition.id} style={rowGrid('minmax(0, 1fr) auto')}>
                {editorFor(condition)}
                <Button
                  type="text"
                  icon={<DeleteIcon />}
                  aria-label={`이 ${label} 조건 빼기`}
                  onClick={() => removeOne(condition.id)}
                />
              </div>
            ) : (
              <div key={condition.id}>{editorFor(condition)}</div>
            ),
          )}
          {cap !== undefined && conditions.length < cap ? (
            <Button
              size="small"
              icon={<AddIcon />}
              style={{ alignSelf: 'flex-start' }}
              onClick={() => add({ kind: first.kind, optionType: label })}
            >
              {ROW_ADD_LABEL[first.kind]}
            </Button>
          ) : null}
        </Flex>
      </Card>
    );
  };

  const nothingToAdd = addable.length === 0 && extraOptions.length === 0;

  return (
    <Flex vertical gap={12}>
      {groups.map(blockOf)}

      {groups.length === 0 && nothingToAdd ? (
        <Text type="secondary">이 카테고리에서는 고를 수 있는 옵션이 없습니다.</Text>
      ) : null}

      {nothingToAdd ? null : (
        <Flex vertical gap={8}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            옵션 추가
          </Text>
          <Flex gap={8} wrap align="center">
            {addable.map((quick) => (
              <Button key={quick.kind} size="small" icon={<AddIcon />} onClick={() => add(quick)}>
                {quick.label}
              </Button>
            ))}
            {extraOptions.length > 0 ? (
              <Select
                value={null}
                size="small"
                placeholder="그 밖의 옵션"
                options={extraOptions}
                showSearch
                optionFilterProp="label"
                optionRender={(option) => (
                  <Flex justify="space-between" gap={12}>
                    <span>{option.label}</span>
                    <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                      {formatNumber(option.data.count)}건
                    </Text>
                  </Flex>
                )}
                onChange={(label: string) => {
                  const entry = catalog.find((each) => each.label === label);
                  if (entry) add(entry);
                }}
                aria-label="그 밖의 옵션 추가"
                popupMatchSelectWidth={260}
                style={{ width: 160 }}
              />
            ) : null}
          </Flex>
        </Flex>
      )}

      <Flex gap={8} justify="space-between" wrap>
        <Button disabled={draft.length === 0} onClick={() => setDraft([])}>
          모두 지우기
        </Button>
        <Button
          type="primary"
          icon={<SearchIcon />}
          onClick={() => onSearch({ conditions: draft.filter(isConditionActive) })}
        >
          검색
        </Button>
      </Flex>
    </Flex>
  );
}

/** 조건 하나가 어느 목록 항목과 짝인지. 자동완성 거리를 거기서 가져온다. */
function entryFor(catalog: CatalogEntry[], condition: Condition): CatalogEntry | undefined {
  switch (condition.kind) {
    case 'reforge':
    case 'enchant':
    case 'special':
    case 'erg':
    case 'relic':
    case 'pet':
      return catalog.find((entry) => entry.kind === condition.kind);
    case 'color':
      return catalog.find((entry) => entry.label === COLOR_OPTION_LABEL);
    default:
      return catalog.find((entry) => entry.optionType === condition.optionType);
  }
}

/**
 * 이름 자동완성. 칸을 누르기만 해도 목록이 열리고, 띄어쓰기와 상관없이 일부만 맞아도 보여 준다.
 * 목록에 없는 이름도 직접 칠 수 있다.
 */
function NameInput({
  value,
  onChange,
  suggestions,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: Suggestion[];
  placeholder: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  /**
   * 친 글자. 칸을 누른 순간에는 비워 두어 이미 들어간 값과 상관없이 전체 목록을 보여 준다.
   * 값을 바꾸려고 칸을 다시 눌렀는데 지금 값 하나만 보이면 다른 것을 고를 수 없다.
   */
  const [query, setQuery] = useState('');
  const options = useMemo(() => {
    const needle = normalizeForSearch(query);
    return suggestions
      .filter((each) => !needle || normalizeForSearch(each.value).includes(needle))
      .slice(0, NAME_SUGGESTION_LIMIT)
      .map((each) => ({ value: each.value, label: each.value, count: each.count }));
  }, [suggestions, query]);

  return (
    <AutoComplete
      value={value}
      options={options}
      open={open && options.length > 0}
      onOpenChange={setOpen}
      onFocus={() => {
        setQuery('');
        setOpen(true);
      }}
      onBlur={() => setOpen(false)}
      onSelect={() => setOpen(false)}
      onChange={(next: string) => {
        onChange(next);
        setQuery(next);
        setOpen(true);
      }}
      allowClear
      placeholder={placeholder}
      aria-label={label}
      getPopupContainer={inPopover}
      popupMatchSelectWidth={false}
      styles={{ popup: { root: NAME_POPUP_STYLE } }}
      // 목록 줄 모양은 optionRender 로만 그린다. label 에 넣으면 고른 뒤 입력칸 안에도 같은 모양으로
      // 그려져, 줄바꿈 때문에 칸이 두 줄 높이로 늘었다.
      optionRender={(option) => (
        <Flex justify="space-between" align="baseline" gap={12}>
          {/* 목록 줄은 기본이 한 줄 말줄임이다. 긴 이름은 줄을 바꿔 끝까지 보인다. */}
          <span style={{ whiteSpace: 'normal' }}>{option.value}</span>
          {option.data.count !== undefined ? (
            <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
              {formatNumber(option.data.count)}건
            </Text>
          ) : null}
        </Flex>
      )}
      style={{ width: '100%', minWidth: 0 }}
    />
  );
}

/**
 * "N 이상" 숫자 자동완성. 불러온 매물의 값에서 "7 이상, 12건" 처럼 그 값 이상인 매물 수를
 * 같이 보여 준다. 매물이 없으면 자주 찾는 기준값을 보여 준다. 목록에 없는 값도 직접 칠 수 있다.
 */
function NumberInput({
  value,
  onChange,
  values,
  defaults,
  levels,
  unit,
  label,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  values: number[] | undefined;
  defaults: number[] | undefined;
  /** 이 조건이 가질 수 있는 레벨을 알 때 그 목록. 주면 values, defaults 대신 쓴다. */
  levels?: LevelSuggestion[];
  unit: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  // 이름 칸과 같이, 칸을 누르면 전체를 보이고 칠 때만 좁힌다.
  const [query, setQuery] = useState('');
  const shown = value === null ? '' : String(value);
  const matchesQuery = (each: { value: number }) => !query || String(each.value).startsWith(query);
  /**
   * 목록을 고르는 순서: 이 조건이 가질 수 있는 레벨을 알면(세공 이름을 고른 경우) 그것,
   * 불러온 값이 있으면 그 값들, 둘 다 없으면 자주 찾는 기준값.
   */
  const suggestions: LevelSuggestion[] = levels
    ? levels.filter(matchesQuery)
    : (values?.length ?? 0) > 0
      ? thresholdSuggestions(values, query)
      : (defaults ?? []).map((each) => ({ value: each })).filter(matchesQuery);

  const options = suggestions.map((each) => ({
    value: String(each.value),
    label: (
      <Flex justify="space-between" gap={12}>
        <span className="tnum">
          {formatNumber(each.value)}
          {unit} 이상
          {each.note ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {' '}
              ({each.note})
            </Text>
          ) : null}
        </span>
        {each.count !== undefined ? (
          <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
            {formatNumber(each.count)}건
          </Text>
        ) : null}
      </Flex>
    ),
  }));

  return (
    <AutoComplete
      value={shown}
      options={options}
      open={open && options.length > 0}
      onOpenChange={setOpen}
      onFocus={() => {
        setQuery('');
        setOpen(true);
      }}
      onBlur={() => setOpen(false)}
      onSelect={() => setOpen(false)}
      onChange={(next: string) => {
        const digits = next.replace(/[^\d]/g, '');
        setQuery(digits);
        setOpen(true);
        onChange(digits === '' ? null : Number(digits));
      }}
      allowClear
      placeholder={`${unit ? `${unit} ` : ''}이상`}
      aria-label={label}
      getPopupContainer={inPopover}
      // 칸은 좁아도 목록은 "22레벨 이상 (한계 돌파) 55건" 이 잘리지 않게 내용만큼 넓힌다.
      // 숫자 칸은 줄 오른쪽 끝에 있어 목록을 오른쪽에 맞춰 왼쪽으로 펼친다. 왼쪽에 맞추면 창 밖으로 나갔다.
      popupMatchSelectWidth={false}
      placement="bottomRight"
      className="tnum"
      style={{ width: NUMBER_INPUT_WIDTH, flex: `0 0 ${NUMBER_INPUT_WIDTH}px` }}
    />
  );
}

function ConditionEditor({
  condition,
  entry,
  names,
  category,
  onChange,
}: {
  condition: Condition;
  entry: CatalogEntry | undefined;
  names: OptionNames | null | undefined;
  category: string;
  onChange: (next: Partial<Condition>) => void;
}) {
  switch (condition.kind) {
    case 'reforge': {
      // 이름을 정확히 골랐으면 그 세공의 레벨만, 아니면 모든 세공의 레벨로 자동완성한다.
      const levels = entry?.numbers[condition.name.trim()] ?? entry?.numbers[''];
      // 세공마다 최대 레벨이 다르다(랜스 차지 쿨타임 감소는 5, 한계 돌파 7). 이름을 알면 그만큼만 권한다.
      const cap = reforgeCap(names, condition.name, category);
      // 이름 칸이 NAME_INPUT_MIN 보다 좁아지면(휴대폰) 레벨 칸을 다음 줄로 넘겨 이름을 한 줄 전체로 쓴다.
      // 좁은 칸에 두면 "컴뱃 마스터리 최대" 까지만 보여 어느 세공인지 알 수 없었다.
      return (
        <Flex gap={6} wrap>
          <div style={{ flex: `1 1 ${NAME_INPUT_MIN}px`, minWidth: 0 }}>
            <NameInput
              value={condition.name}
              onChange={(name) => onChange({ name })}
              suggestions={mergeNames(entry?.values, names?.reforges)}
              placeholder="세공 이름, 비우면 아무 세공"
              label="세공 이름"
            />
          </div>
          <NumberInput
            value={condition.minLevel}
            onChange={(minLevel) => onChange({ minLevel })}
            values={levels}
            defaults={DEFAULT_THRESHOLDS.reforge}
            levels={
              cap ? reforgeLevelSuggestions(cap, entry?.numbers[condition.name.trim()]) : undefined
            }
            unit="레벨"
            label="세공 최소 레벨"
          />
        </Flex>
      );
    }
    case 'enchant':
      // 두 칸을 나란히 둔다. 위아래로 두면 접두 칸의 목록이 접미 칸을 덮어 누를 수 없다.
      return (
        <div style={rowGrid('minmax(0, 1fr) minmax(0, 1fr)')}>
          <NameInput
            value={condition.prefix}
            onChange={(prefix) => onChange({ prefix })}
            suggestions={mergeNames(entry?.valuesBySub[ENCHANT_PREFIX], names?.enchants.prefix)}
            placeholder="접두 인챈트"
            label="접두 인챈트"
          />
          <NameInput
            value={condition.suffix}
            onChange={(suffix) => onChange({ suffix })}
            suggestions={mergeNames(entry?.valuesBySub[ENCHANT_SUFFIX], names?.enchants.suffix)}
            placeholder="접미 인챈트"
            label="접미 인챈트"
          />
        </div>
      );
    case 'special':
      return (
        <Flex gap={6}>
          <Select
            value={condition.type}
            onChange={(type) => onChange({ type })}
            options={SPECIAL_OPTIONS}
            aria-label="특별 개조 종류"
            getPopupContainer={inPopover}
            style={{ flex: '1 1 auto', minWidth: 0 }}
          />
          <NumberInput
            value={condition.minStep}
            onChange={(minStep) => onChange({ minStep })}
            values={entry?.numbers['']}
            defaults={DEFAULT_THRESHOLDS.special}
            unit="단계"
            label="특별 개조 최소 단계"
          />
        </Flex>
      );
    case 'erg':
      return (
        <Flex gap={6}>
          <Select
            value={condition.grade}
            onChange={(grade) => onChange({ grade })}
            options={[
              { value: '', label: '아무 등급' },
              ...(entry?.subTypes.length ? entry.subTypes : ['S', 'A', 'B']).map((grade) => ({
                value: grade,
                label: `등급 ${grade}`,
              })),
            ]}
            aria-label="에르그 등급"
            getPopupContainer={inPopover}
            style={{ flex: '1 1 auto', minWidth: 0 }}
          />
          <NumberInput
            value={condition.minLevel}
            onChange={(minLevel) => onChange({ minLevel })}
            values={entry?.numbers['']}
            defaults={DEFAULT_THRESHOLDS.erg}
            unit="레벨"
            label="에르그 최소 레벨"
          />
        </Flex>
      );
    case 'color':
      // 처음 열었을 때 값이 들어 있으면 안 된다. 채널마다 사용자가 채운 것만 조건이 된다.
      return (
        <Flex vertical gap={10}>
          <Select
            value={condition.part}
            onChange={(part) => onChange({ part })}
            options={PART_OPTIONS}
            aria-label="색을 볼 파트"
            getPopupContainer={inPopover}
            style={{ width: 110 }}
          />
          <ColorChannelFields
            channels={condition}
            onChange={(key, channel) => onChange({ [key]: channel })}
          />
        </Flex>
      );
    case 'relic': {
      // 이름을 정확히 골랐으면 레벨마다 그 옵션의 수치를 붙인다. 수치를 몰라도 레벨로 고르게 하려는 것이다.
      const scale = entry?.scales[condition.name.trim()];
      const levelOptions = (empty: string) => [
        { value: 0, label: empty },
        ...RELIC_LEVELS.map((level) => ({
          value: level,
          label: scale
            ? `${level}레벨 (${formatRelicValue(scale, relicValueAt(scale, level))})`
            : `${level}레벨`,
        })),
      ];
      // 0 은 끝이 없다는 뜻이다. 한쪽을 바꿔 두 끝이 엇갈리면 다른 쪽을 따라 옮긴다.
      const setMin = (level: number) => {
        const minLevel = level || null;
        const crossed = minLevel !== null && condition.maxLevel !== null && minLevel > condition.maxLevel;
        onChange(crossed ? { minLevel, maxLevel: minLevel } : { minLevel });
      };
      const setMax = (level: number) => {
        const maxLevel = level || null;
        const crossed = maxLevel !== null && condition.minLevel !== null && maxLevel < condition.minLevel;
        onChange(crossed ? { maxLevel, minLevel: maxLevel } : { maxLevel });
      };
      return (
        <Flex vertical gap={8}>
          <NameInput
            value={condition.name}
            onChange={(name) => onChange({ name })}
            suggestions={mergeNames(entry?.values, undefined)}
            placeholder="스킬 이름, 비우면 아무 옵션"
            label="무리아스 유물 스킬 옵션"
          />
          <Flex gap={6} align="center">
            <Select
              value={condition.minLevel ?? 0}
              onChange={setMin}
              options={levelOptions('하한 없음')}
              aria-label="무리아스 유물 최소 레벨"
              getPopupContainer={inPopover}
              popupMatchSelectWidth={false}
              className="tnum"
              style={{ flex: '1 1 0', minWidth: 0 }}
            />
            <Text type="secondary">~</Text>
            <Select
              value={condition.maxLevel ?? 0}
              onChange={setMax}
              options={levelOptions('상한 없음')}
              aria-label="무리아스 유물 최대 레벨"
              getPopupContainer={inPopover}
              popupMatchSelectWidth={false}
              className="tnum"
              style={{ flex: '1 1 0', minWidth: 0 }}
            />
          </Flex>
          <Text type="secondary" style={{ fontSize: 12 }}>
            레벨은 1에서 10까지이고, 한 레벨마다 최대 수치의 10분의 1씩 오릅니다.
          </Text>
        </Flex>
      );
    }
    case 'pet': {
      const isSpecies = condition.field === PET_SPECIES_FIELD;
      return (
        <div style={rowGrid('132px minmax(0, 1fr)')}>
          <Select
            value={condition.field}
            onChange={(field) => onChange({ field, text: '', min: null })}
            options={PET_FIELDS.map((field) => ({ value: field, label: field }))}
            aria-label="펫 정보 항목"
            getPopupContainer={inPopover}
          />
          {isSpecies ? (
            <NameInput
              value={condition.text}
              onChange={(text) => onChange({ text })}
              suggestions={mergeNames(entry?.values, undefined)}
              placeholder="종족명"
              label="펫 종족명"
            />
          ) : (
            <NumberInput
              value={condition.min}
              onChange={(min) => onChange({ min })}
              values={entry?.numbers[condition.field]}
              defaults={undefined}
              unit=""
              label={`펫 ${condition.field} 최솟값`}
            />
          )}
        </div>
      );
    }
    case 'number':
      return (
        <NumberInput
          value={condition.min}
          onChange={(min) => onChange({ min })}
          values={entry?.numbers['']}
          defaults={undefined}
          unit=""
          label={`${numberLabel(condition.optionType)} 최솟값`}
        />
      );
    case 'text':
      return (
        <NameInput
          value={condition.text}
          onChange={(text) => onChange({ text })}
          suggestions={mergeNames(entry?.values, undefined)}
          placeholder="들어 있는 문구"
          label={`${condition.optionType} 문구`}
        />
      );
  }
}
