import { useMemo, useState, type ReactNode } from 'react';
import { AutoComplete, Button, ColorPicker, Flex, Popover, Select, Slider, Typography } from 'antd';
import { AddIcon, ArrowDownIcon, DeleteIcon } from '@/components/icons';
import { normalizeForSearch } from '@/features/auction/dictionary';
import {
  COLOR_OPTION_LABEL,
  conditionLabel,
  ENCHANT_PREFIX,
  ENCHANT_SUFFIX,
  isConditionActive,
  newCondition,
  numberLabel,
  QUICK_CONDITIONS,
  summarizeCondition,
  thresholdSuggestions,
  type CatalogEntry,
  type Condition,
  type ConditionKind,
  type OptionFilter,
} from '@/features/auction/optionFilter';
import type { OptionNames } from '@/features/auction/optionNames';
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
 * 창 안의 목록(자동완성, 고르기, 색 고르기)을 창 안에 그린다. 바깥(body)에 그리면 목록을 누르는
 * 순간 창이 "바깥을 눌렀다" 고 보고 닫힌다.
 */
const inPopover = (trigger: HTMLElement): HTMLElement =>
  trigger.closest<HTMLElement>('.ant-popover') ?? document.body;

/** 자동완성 목록에 한 번에 보여 줄 이름 수. 더 좁히려면 글자를 친다. */
const NAME_SUGGESTION_LIMIT = 50;

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

/** 버튼 하나가 맡는 조건 묶음. 자주 쓰는 다섯 가지는 종류별로, 그 밖의 옵션은 조건마다 하나. */
type GroupKey = ConditionKind | `extra:${number}`;

const groupOf = (condition: Condition): GroupKey =>
  condition.kind === 'number' || condition.kind === 'text'
    ? `extra:${condition.id}`
    : condition.kind;

/**
 * 경매장 상세 검색.
 *
 * 검색 칸 바로 아래에 조건 단추를 한 줄로 둔다. 단추를 누르면 그 아래에 작은 창이 열려 값을
 * 고른다. 조건을 걸면 단추 글이 "세공 스매시 대미지 10레벨 이상" 처럼 바뀐다. 입력칸을 검색
 * 카드에 늘어놓으면 카드가 길어져 결과가 밀리고, 옆 서랍에 두면 검색과 따로 노는 기능처럼 보였다.
 *
 * 넥슨 경매장 API 는 옵션으로 찾지 못해 불러온 매물을 이 조건으로 거른다. 자동완성은 불러온
 * 매물의 이름과 값을 먼저, 게임 데이터의 이름을 그 뒤에 보여 준다.
 */
export function DetailSearchBar({
  value,
  onChange,
  catalog,
  names,
}: {
  value: OptionFilter;
  onChange: (next: OptionFilter) => void;
  catalog: CatalogEntry[];
  names: OptionNames | null | undefined;
}) {
  const [openGroup, setOpenGroup] = useState<GroupKey | null>(null);

  const setConditions = (conditions: Condition[]) => onChange({ conditions });
  const update = (id: number, next: Partial<Condition>) =>
    setConditions(
      value.conditions.map((condition) =>
        condition.id === id ? ({ ...condition, ...next } as Condition) : condition,
      ),
    );
  const remove = (id: number) =>
    setConditions(value.conditions.filter((condition) => condition.id !== id));
  const inGroup = (group: GroupKey) =>
    value.conditions.filter((condition) => groupOf(condition) === group);

  /** 단추를 열면 빈 조건을 하나 만들어 바로 고르게 하고, 닫을 때 빈 조건은 치운다. */
  const toggleGroup = (group: GroupKey, open: boolean) => {
    if (open) {
      const quick = QUICK_CONDITIONS.find((each) => each.kind === group);
      if (quick && inGroup(group).length === 0)
        setConditions([...value.conditions, newCondition(quick)]);
      setOpenGroup(group);
      return;
    }
    setConditions(
      value.conditions.filter(
        (condition) => groupOf(condition) !== group || isConditionActive(condition),
      ),
    );
    setOpenGroup(null);
  };

  const quickKinds = new Set<ConditionKind>(QUICK_CONDITIONS.map((quick) => quick.kind));
  const moreOptions = catalog
    .filter((entry) => !quickKinds.has(entry.kind))
    .map((entry) => ({ value: entry.label, label: entry.label, count: entry.count }));
  const extras = value.conditions.filter(
    (condition) => condition.kind === 'number' || condition.kind === 'text',
  );
  const anyActive = value.conditions.some(isConditionActive);

  const editorFor = (condition: Condition) => (
    <ConditionEditor
      condition={condition}
      entry={entryFor(catalog, condition)}
      names={names}
      onChange={(next) => update(condition.id, next)}
    />
  );

  return (
    <Flex gap={6} wrap align="center">
      <Text strong style={{ fontSize: 13, marginInlineEnd: 2 }}>
        상세 검색
      </Text>

      {QUICK_CONDITIONS.map((quick) => {
        const group = quick.kind;
        const conditions = inGroup(group);
        const active = conditions.filter(isConditionActive);
        const label =
          active.length === 0
            ? quick.label
            : `${summarizeCondition(active[0])}${active.length > 1 ? ` 외 ${active.length - 1}` : ''}`;
        return (
          <ConditionPopover
            key={group}
            open={openGroup === group}
            onOpenChange={(open) => toggleGroup(group, open)}
            title={quick.label}
            onClear={() => {
              setConditions(value.conditions.filter((condition) => groupOf(condition) !== group));
              setOpenGroup(null);
            }}
            active={active.length > 0}
            label={label}
            content={
              <Flex vertical gap={10}>
                {conditions.map((condition) => (
                  <Flex key={condition.id} gap={6} align="flex-start">
                    <div style={{ flex: '1 1 auto', minWidth: 0 }}>{editorFor(condition)}</div>
                    {group === 'reforge' && conditions.length > 1 ? (
                      <Button
                        type="text"
                        size="small"
                        icon={<DeleteIcon />}
                        aria-label="이 세공 조건 빼기"
                        onClick={() => remove(condition.id)}
                      />
                    ) : null}
                  </Flex>
                ))}
                {group === 'reforge' && conditions.length < MAX_REFORGE_CONDITIONS ? (
                  <Button
                    size="small"
                    icon={<AddIcon />}
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => setConditions([...value.conditions, newCondition(quick)])}
                  >
                    세공 조건 추가
                  </Button>
                ) : null}
              </Flex>
            }
          />
        );
      })}

      {extras.map((condition) => {
        const group = groupOf(condition);
        return (
          <ConditionPopover
            key={group}
            open={openGroup === group}
            onOpenChange={(open) => toggleGroup(group, open)}
            title={conditionLabel(condition)}
            onClear={() => {
              remove(condition.id);
              setOpenGroup(null);
            }}
            active={isConditionActive(condition)}
            label={summarizeCondition(condition) || conditionLabel(condition)}
            content={editorFor(condition)}
          />
        );
      })}

      <Select
        value={null}
        size="small"
        placeholder="+ 옵션"
        options={moreOptions}
        disabled={moreOptions.length === 0}
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
          if (!entry) return;
          const condition = newCondition(entry);
          setConditions([...value.conditions, condition]);
          // 고르자마자 값을 넣는 창을 연다.
          setOpenGroup(groupOf(condition));
        }}
        aria-label="그 밖의 옵션으로 상세 검색"
        title={
          moreOptions.length === 0
            ? '매물을 불러오면 최대 공격, 세트 효과처럼 그 매물에 있는 옵션을 고를 수 있습니다.'
            : undefined
        }
        popupMatchSelectWidth={240}
        style={{ width: 96 }}
      />

      {anyActive ? (
        <Button size="small" type="link" onClick={() => setConditions([])}>
          조건 모두 지우기
        </Button>
      ) : null}
    </Flex>
  );
}

/** 조건 단추와 그 아래에 열리는 작은 창. */
function ConditionPopover({
  open,
  onOpenChange,
  title,
  onClear,
  active,
  label,
  content,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onClear: () => void;
  active: boolean;
  label: string;
  content: ReactNode;
}) {
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      trigger="click"
      placement="bottomLeft"
      destroyOnHidden
      title={title}
      content={
        <Flex vertical gap={12} style={{ width: 340, maxWidth: 'calc(100vw - 48px)' }}>
          {content}
          <Flex justify="flex-end" gap={8}>
            <Button size="small" onClick={onClear}>
              지우기
            </Button>
            <Button size="small" type="primary" onClick={() => onOpenChange(false)}>
              확인
            </Button>
          </Flex>
        </Flex>
      }
    >
      <Button
        size="small"
        color={active ? 'primary' : 'default'}
        variant="outlined"
        icon={<ArrowDownIcon />}
        iconPlacement="end"
        aria-expanded={open}
      >
        {label}
      </Button>
    </Popover>
  );
}

/** 조건 하나가 어느 목록 항목과 짝인지. 자동완성 거리를 거기서 가져온다. */
function entryFor(catalog: CatalogEntry[], condition: Condition): CatalogEntry | undefined {
  switch (condition.kind) {
    case 'reforge':
    case 'enchant':
    case 'special':
    case 'erg':
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
      .map((each) => ({
        value: each.value,
        label: (
          <Flex justify="space-between" gap={12}>
            <span>{each.value}</span>
            {each.count !== undefined ? (
              <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                {formatNumber(each.count)}건
              </Text>
            ) : null}
          </Flex>
        ),
      }));
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
      style={{ width: '100%' }}
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
  unit,
  label,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  values: number[] | undefined;
  defaults: number[] | undefined;
  unit: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  // 이름 칸과 같이, 칸을 누르면 전체를 보이고 칠 때만 좁힌다.
  const [query, setQuery] = useState('');
  const shown = value === null ? '' : String(value);
  const counted = thresholdSuggestions(values, query);
  // 불러온 값이 있으면 그것만 쓴다(치는 글자에 맞는 것이 없으면 빈 목록). 없을 때만 기준값을 보인다.
  const suggestions =
    (values?.length ?? 0) > 0
      ? counted
      : (defaults ?? [])
          .filter((each) => !query || String(each).startsWith(query))
          .map((each) => ({ value: each, count: undefined as number | undefined }));

  const options = suggestions.map((each) => ({
    value: String(each.value),
    label: (
      <Flex justify="space-between" gap={12}>
        <span className="tnum">
          {formatNumber(each.value)}
          {unit} 이상
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
      // 칸은 좁아도 목록은 "20레벨 이상 55건" 이 잘리지 않게 내용만큼 넓힌다.
      popupMatchSelectWidth={false}
      className="tnum"
      style={{ width: 130, flex: '0 0 130px' }}
    />
  );
}

function ConditionEditor({
  condition,
  entry,
  names,
  onChange,
}: {
  condition: Condition;
  entry: CatalogEntry | undefined;
  names: OptionNames | null | undefined;
  onChange: (next: Partial<Condition>) => void;
}) {
  switch (condition.kind) {
    case 'reforge': {
      // 이름을 정확히 골랐으면 그 세공의 레벨만, 아니면 모든 세공의 레벨로 자동완성한다.
      const levels = entry?.numbers[condition.name.trim()] ?? entry?.numbers[''];
      return (
        <Flex gap={6}>
          <NameInput
            value={condition.name}
            onChange={(name) => onChange({ name })}
            suggestions={mergeNames(entry?.values, names?.reforges)}
            placeholder="세공 이름, 비우면 아무 세공"
            label="세공 이름"
          />
          <NumberInput
            value={condition.minLevel}
            onChange={(minLevel) => onChange({ minLevel })}
            values={levels}
            defaults={DEFAULT_THRESHOLDS.reforge}
            unit="레벨"
            label="세공 최소 레벨"
          />
        </Flex>
      );
    }
    case 'enchant':
      // 두 칸을 나란히 둔다. 위아래로 두면 접두 칸의 목록이 접미 칸을 덮어 누를 수 없다.
      return (
        <Flex gap={6}>
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
        </Flex>
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
      return (
        <Flex vertical gap={8}>
          <Flex gap={6} wrap align="center">
            <ColorPicker
              value={condition.hex}
              onChange={(color) => onChange({ hex: color.toHexString() })}
              // 마비노기는 색을 RGB 로 보여 준다. 주머니 찾기와 같은 입력 방식을 쓴다.
              defaultFormat="rgb"
              disabledAlpha
              showText={(color) => {
                const { r, g, b } = color.toRgb();
                return <span className="tnum">{`R:${r} G:${g} B:${b}`}</span>;
              }}
              aria-label="찾을 색"
              getPopupContainer={inPopover}
            />
            <Select
              value={condition.part}
              onChange={(part) => onChange({ part })}
              options={PART_OPTIONS}
              aria-label="색을 볼 파트"
              getPopupContainer={inPopover}
              style={{ width: 110 }}
            />
          </Flex>
          <Flex gap={8} align="center">
            <Text style={{ whiteSpace: 'nowrap' }}>비슷함</Text>
            <Slider
              value={condition.minSimilarity}
              onChange={(minSimilarity) => onChange({ minSimilarity })}
              min={80}
              max={100}
              step={0.5}
              aria-label="색이 비슷한 정도"
              style={{ flex: '1 1 auto' }}
            />
            <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
              {condition.minSimilarity}% 이상
            </Text>
          </Flex>
        </Flex>
      );
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
