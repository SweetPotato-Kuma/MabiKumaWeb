import { useMemo } from 'react';
import {
  AutoComplete,
  Button,
  ColorPicker,
  Drawer,
  Flex,
  Grid,
  Select,
  Slider,
  Tag,
  Typography,
} from 'antd';
import { AddIcon, DeleteIcon } from '@/components/icons';
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
  type NameCount,
  type OptionFilter,
} from '@/features/auction/optionFilter';
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

/** 자동완성 목록에 한 번에 보여 줄 이름 수. 더 좁히려면 글자를 친다. */
const NAME_SUGGESTION_LIMIT = 50;

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
 * 검색 칸 아래의 조건 칩. 걸어 둔 조건을 한 줄로 보여 주고, 칩의 x 로 바로 뺀다.
 * 고치려면 칩을 누르거나 "상세 검색" 을 눌러 서랍을 연다.
 */
export function ConditionChips({
  value,
  onChange,
  onEdit,
}: {
  value: OptionFilter;
  onChange: (next: OptionFilter) => void;
  onEdit: () => void;
}) {
  const active = value.conditions.filter(isConditionActive);
  if (active.length === 0) return null;
  return (
    <Flex gap={6} wrap align="center">
      {active.map((condition) => (
        <Tag
          key={condition.id}
          closable
          onClose={(event) => {
            event.preventDefault();
            onChange({
              conditions: value.conditions.filter((each) => each.id !== condition.id),
            });
          }}
          onClick={onEdit}
          style={{ cursor: 'pointer', marginInlineEnd: 0 }}
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
 * 경매장 상세 검색 서랍.
 *
 * 조건을 고치는 칸을 검색 카드에서 떼어 서랍에 둔다. 검색 카드에 두면 조건이 늘 때마다 카드가
 * 길어져 결과 표가 화면 아래로 밀렸다. 조건은 고치는 즉시 뒤의 표에 걸리고, 아래에 맞는 건수가
 * 나온다.
 *
 * 자주 쓰는 조건(세공, 인챈트, 특별 개조, 에르그, 색상)은 단추로 바로 더하고, 그 밖의 옵션은
 * 불러온 매물에 있는 것 가운데서 고른다. 모든 입력칸은 불러온 매물에서 뽑은 자동완성을 준다.
 */
export function DetailSearchDrawer({
  open,
  onClose,
  value,
  onChange,
  catalog,
  loadedCount,
  matchedCount,
}: {
  open: boolean;
  onClose: () => void;
  value: OptionFilter;
  onChange: (next: OptionFilter) => void;
  catalog: CatalogEntry[];
  loadedCount: number;
  matchedCount: number;
}) {
  const screens = Grid.useBreakpoint();
  const add = (entry: Pick<CatalogEntry, 'kind' | 'optionType'>) =>
    onChange({ conditions: [...value.conditions, newCondition(entry)] });
  const update = (id: number, next: Partial<Condition>) =>
    onChange({
      conditions: value.conditions.map((condition) =>
        condition.id === id ? ({ ...condition, ...next } as Condition) : condition,
      ),
    });
  const remove = (id: number) =>
    onChange({ conditions: value.conditions.filter((condition) => condition.id !== id) });

  const quickKinds = new Set(QUICK_CONDITIONS.map((quick) => quick.kind));
  const moreOptions = useMemo(
    () =>
      catalog
        .filter((entry) => !quickKinds.has(entry.kind))
        .map((entry) => ({ value: entry.label, label: entry.label, count: entry.count })),
    // quickKinds 는 상수에서 나온다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog],
  );

  const active = value.conditions.filter(isConditionActive).length;

  return (
    <Drawer
      title="상세 검색"
      open={open}
      onClose={onClose}
      // 닫을 때 입력칸을 내린다. 자동완성 목록이 서랍 밖에 떠 남지 않게. 조건 값은 화면이 들고 있다.
      destroyOnHidden
      size={screens.md ? 520 : '100%'}
      footer={
        <Flex justify="space-between" align="center" gap={8} wrap>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {loadedCount > 0 ? (
              <>
                불러온 <span className="tnum">{formatNumber(loadedCount)}</span>건 가운데{' '}
                <span className="tnum">{formatNumber(matchedCount)}</span>건이 맞습니다.
              </>
            ) : (
              '찾기를 누르면 불러온 매물에 조건이 걸립니다.'
            )}
          </Text>
          <Flex gap={8}>
            {value.conditions.length > 0 ? (
              <Button onClick={() => onChange({ conditions: [] })}>모두 지우기</Button>
            ) : null}
            <Button type="primary" onClick={onClose}>
              결과 보기
            </Button>
          </Flex>
        </Flex>
      }
    >
      <Flex vertical gap={16}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          넥슨 경매장 API 는 옵션으로 찾지 못해, 불러온 매물을 이 조건으로 거릅니다. 맞는 것이
          모자라면 다음 매물을 더 불러옵니다. 자동완성은 불러온 매물에 있는 값입니다.
        </Text>

        <Flex vertical gap={8}>
          <Text strong>조건 더하기</Text>
          <Flex gap={8} wrap>
            {QUICK_CONDITIONS.map((quick) => (
              <Button key={quick.kind} size="small" icon={<AddIcon />} onClick={() => add(quick)}>
                {quick.label}
              </Button>
            ))}
          </Flex>
          <Select
            value={null}
            placeholder="그 밖의 옵션 고르기 (예: 최대 공격, 세트 효과)"
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
              if (entry) add(entry);
            }}
            aria-label="그 밖의 옵션 조건 더하기"
          />
        </Flex>

        {value.conditions.length === 0 ? (
          <Text type="secondary">
            위에서 조건을 더하면 여기서 값을 고릅니다. 세공은 이름과 레벨, 인챈트는 접두와 접미를
            따로 넣을 수 있습니다.
          </Text>
        ) : (
          <Flex vertical gap={12}>
            <Text strong>
              걸어 둔 조건 <span className="tnum">{active}</span>개
            </Text>
            {value.conditions.map((condition) => (
              <Flex key={condition.id} vertical gap={8}>
                <Flex justify="space-between" align="center">
                  <Text>{conditionLabel(condition)}</Text>
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteIcon />}
                    aria-label={`${conditionLabel(condition)} 조건 빼기`}
                    onClick={() => remove(condition.id)}
                  />
                </Flex>
                <ConditionEditor
                  condition={condition}
                  entry={entryFor(catalog, condition)}
                  onChange={(next) => update(condition.id, next)}
                />
              </Flex>
            ))}
          </Flex>
        )}
      </Flex>
    </Drawer>
  );
}

/** 이름 자동완성. 불러온 매물의 이름에서 띄어쓰기와 상관없이 일부만 맞아도 보여 준다. */
function NameInput({
  value,
  onChange,
  names,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  names: NameCount[] | undefined;
  placeholder: string;
  label: string;
}) {
  const options = useMemo(() => {
    const needle = normalizeForSearch(value);
    return (names ?? [])
      .filter((each) => !needle || normalizeForSearch(each.value).includes(needle))
      .slice(0, NAME_SUGGESTION_LIMIT)
      .map((each) => ({
        value: each.value,
        label: (
          <Flex justify="space-between" gap={12}>
            <span>{each.value}</span>
            <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
              {formatNumber(each.count)}건
            </Text>
          </Flex>
        ),
      }));
  }, [names, value]);

  return (
    <AutoComplete
      value={value}
      options={options}
      onChange={onChange}
      allowClear
      placeholder={placeholder}
      aria-label={label}
      style={{ flex: '1 1 200px', minWidth: 0 }}
    />
  );
}

/**
 * "N 이상" 숫자 자동완성. 불러온 매물의 값에서 "7 이상, 12건" 처럼 그 값 이상인 매물 수를
 * 같이 보여 준다. 목록에 없는 값도 직접 칠 수 있다.
 */
function NumberInput({
  value,
  onChange,
  values,
  unit,
  label,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  values: number[] | undefined;
  unit: string;
  label: string;
}) {
  const shown = value === null ? '' : String(value);

  const options = thresholdSuggestions(values, shown).map((each) => ({
    value: String(each.value),
    label: (
      <Flex justify="space-between" gap={12}>
        <span className="tnum">
          {formatNumber(each.value)}
          {unit} 이상
        </span>
        <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
          {formatNumber(each.count)}건
        </Text>
      </Flex>
    ),
  }));

  return (
    <AutoComplete
      value={shown}
      options={options}
      onChange={(next: string) => {
        const digits = next.replace(/[^\d]/g, '');
        onChange(digits === '' ? null : Number(digits));
      }}
      allowClear
      placeholder={`${unit ? `${unit} ` : ''}이상`}
      aria-label={label}
      className="tnum"
      style={{ width: 150, flex: '0 0 150px' }}
    />
  );
}

function ConditionEditor({
  condition,
  entry,
  onChange,
}: {
  condition: Condition;
  entry: CatalogEntry | undefined;
  onChange: (next: Partial<Condition>) => void;
}) {
  switch (condition.kind) {
    case 'reforge': {
      // 이름을 정확히 골랐으면 그 세공의 레벨만, 아니면 모든 세공의 레벨로 자동완성한다.
      const levels = entry?.numbers[condition.name.trim()] ?? entry?.numbers[''];
      return (
        <Flex gap={8} wrap>
          <NameInput
            value={condition.name}
            onChange={(name) => onChange({ name })}
            names={entry?.values}
            placeholder="세공 이름, 비우면 아무 세공"
            label="세공 이름"
          />
          <NumberInput
            value={condition.minLevel}
            onChange={(minLevel) => onChange({ minLevel })}
            values={levels}
            unit="레벨"
            label="세공 최소 레벨"
          />
        </Flex>
      );
    }
    case 'enchant':
      return (
        <Flex gap={8} wrap>
          <NameInput
            value={condition.prefix}
            onChange={(prefix) => onChange({ prefix })}
            names={entry?.valuesBySub[ENCHANT_PREFIX]}
            placeholder="접두 인챈트"
            label="접두 인챈트"
          />
          <NameInput
            value={condition.suffix}
            onChange={(suffix) => onChange({ suffix })}
            names={entry?.valuesBySub[ENCHANT_SUFFIX]}
            placeholder="접미 인챈트"
            label="접미 인챈트"
          />
        </Flex>
      );
    case 'special':
      return (
        <Flex gap={8} wrap>
          <Select
            value={condition.type}
            onChange={(type) => onChange({ type })}
            options={SPECIAL_OPTIONS}
            aria-label="특별 개조 종류"
            style={{ flex: '1 1 160px' }}
          />
          <NumberInput
            value={condition.minStep}
            onChange={(minStep) => onChange({ minStep })}
            values={entry?.numbers['']}
            unit="단계"
            label="특별 개조 최소 단계"
          />
        </Flex>
      );
    case 'erg':
      return (
        <Flex gap={8} wrap>
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
            style={{ flex: '1 1 160px' }}
          />
          <NumberInput
            value={condition.minLevel}
            onChange={(minLevel) => onChange({ minLevel })}
            values={entry?.numbers['']}
            unit="레벨"
            label="에르그 최소 레벨"
          />
        </Flex>
      );
    case 'color':
      return (
        <Flex vertical gap={8}>
          <Flex gap={8} wrap align="center">
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
            />
            <Select
              value={condition.part}
              onChange={(part) => onChange({ part })}
              options={PART_OPTIONS}
              aria-label="색을 볼 파트"
              style={{ width: 120 }}
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
          unit=""
          label={`${numberLabel(condition.optionType)} 최솟값`}
        />
      );
    case 'text':
      return (
        <NameInput
          value={condition.text}
          onChange={(text) => onChange({ text })}
          names={entry?.values}
          placeholder="들어 있는 문구"
          label={`${condition.optionType} 문구`}
        />
      );
  }
}
