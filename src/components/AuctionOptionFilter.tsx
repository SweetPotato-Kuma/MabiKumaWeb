import { useMemo } from 'react';
import {
  AutoComplete,
  Button,
  ColorPicker,
  Flex,
  InputNumber,
  Select,
  Slider,
  Typography,
} from 'antd';
import { DeleteIcon } from '@/components/icons';
import { normalizeForSearch } from '@/features/auction/dictionary';
import {
  COLOR_OPTION_LABEL,
  newCondition,
  numberLabel,
  type CatalogEntry,
  type Condition,
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

/** 조건 줄 앞의 이름 칸 폭. 줄마다 입력칸이 같은 자리에서 시작하게 한다. */
const LABEL_WIDTH = 96;

/** 조건 하나가 어느 목록 항목과 짝인지. 고를 거리(세공 이름 등)를 거기서 가져온다. */
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

function conditionLabel(condition: Condition): string {
  switch (condition.kind) {
    case 'reforge':
      return '세공';
    case 'enchant':
      return '인챈트';
    case 'special':
      return '특별 개조';
    case 'erg':
      return '에르그';
    case 'color':
      return '색상';
    case 'number':
      return numberLabel(condition.optionType);
    case 'text':
      return condition.optionType || '옵션 문구';
  }
}

/**
 * 경매장 세부 옵션 조건.
 *
 * "옵션 조건 추가" 에서 고르면 조건 한 줄이 생긴다. 고를 수 있는 옵션과 그 안의 이름(세공,
 * 인챈트, 세트 효과)은 지금 불러온 매물에서 뽑은 것이라 카테고리마다 맞게 바뀐다(catalog).
 * 조건은 찾기를 다시 누르지 않아도 불러온 매물에 바로 걸린다. 넥슨 API 가 옵션으로 찾지 못해
 * 받아 온 뒤 화면에서 거르는 것이라, 이 칸은 검색이 아니라 거르기다.
 */
export function AuctionOptionFilter({
  value,
  onChange,
  catalog,
}: {
  value: OptionFilter;
  onChange: (next: OptionFilter) => void;
  catalog: CatalogEntry[];
}) {
  const update = (id: number, next: Partial<Condition>) =>
    onChange({
      conditions: value.conditions.map((condition) =>
        condition.id === id ? ({ ...condition, ...next } as Condition) : condition,
      ),
    });
  const remove = (id: number) =>
    onChange({ conditions: value.conditions.filter((condition) => condition.id !== id) });

  const addOptions = useMemo(
    () => catalog.map((entry) => ({ value: entry.label, label: entry.label, count: entry.count })),
    [catalog],
  );

  return (
    <Flex vertical gap={10}>
      <Flex gap={8} wrap align="center">
        <Select
          value={null}
          placeholder="+ 옵션 조건 추가"
          options={addOptions}
          disabled={catalog.length === 0}
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
            if (entry) onChange({ conditions: [...value.conditions, newCondition(entry)] });
          }}
          aria-label="옵션 조건 추가"
          popupMatchSelectWidth={260}
          style={{ width: 200 }}
        />
        <Text type="secondary" style={{ fontSize: 12, flex: '1 1 240px' }}>
          {catalog.length === 0
            ? '매물을 불러오면 그 매물에 있는 옵션(세공, 인챈트, 색상 등)으로 거를 수 있습니다.'
            : '불러온 매물에 있는 옵션만 고를 수 있습니다. 넥슨 API 가 옵션으로 찾지 못해 불러온 매물을 거릅니다.'}
        </Text>
        {value.conditions.length > 0 ? (
          <Button size="small" type="link" onClick={() => onChange({ conditions: [] })}>
            조건 모두 지우기
          </Button>
        ) : null}
      </Flex>

      {value.conditions.map((condition) => (
        <Flex key={condition.id} gap={8} align="center" wrap>
          <Text strong style={{ width: LABEL_WIDTH, flex: `0 0 ${LABEL_WIDTH}px` }}>
            {conditionLabel(condition)}
          </Text>
          <Flex gap={8} align="center" wrap style={{ flex: '1 1 320px', minWidth: 0 }}>
            <ConditionEditor
              condition={condition}
              entry={entryFor(catalog, condition)}
              onChange={(next) => update(condition.id, next)}
            />
          </Flex>
          <Button
            type="text"
            icon={<DeleteIcon />}
            aria-label={`${conditionLabel(condition)} 조건 빼기`}
            onClick={() => remove(condition.id)}
          />
        </Flex>
      ))}
    </Flex>
  );
}

/** 불러온 매물의 이름 목록에서 고르거나 직접 친다. 띄어쓰기와 상관없이 일부만 맞아도 보여 준다. */
function NameInput({
  value,
  onChange,
  entry,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  entry: CatalogEntry | undefined;
  placeholder: string;
  label: string;
}) {
  const options = useMemo(() => {
    const needle = normalizeForSearch(value);
    return (entry?.values ?? [])
      .filter((each) => !needle || normalizeForSearch(each.value).includes(needle))
      .slice(0, 50)
      .map((each) => ({
        value: each.value,
        label: (
          <Flex justify="space-between" gap={12}>
            <span>{each.value}</span>
            <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
              {formatNumber(each.count)}
            </Text>
          </Flex>
        ),
      }));
  }, [entry, value]);

  return (
    <AutoComplete
      value={value}
      options={options}
      onChange={onChange}
      allowClear
      placeholder={placeholder}
      aria-label={label}
      popupMatchSelectWidth={false}
      style={{ flex: '1 1 200px', minWidth: 160 }}
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
    case 'reforge':
      return (
        <>
          <NameInput
            value={condition.name}
            onChange={(name) => onChange({ name })}
            entry={entry}
            placeholder="비우면 아무 세공"
            label="세공 이름"
          />
          <InputNumber
            value={condition.minLevel}
            onChange={(minLevel) => onChange({ minLevel: minLevel ?? null })}
            min={1}
            max={30}
            precision={0}
            suffix="레벨 이상"
            aria-label="세공 최소 레벨"
            className="tnum"
            style={{ width: 140 }}
          />
        </>
      );
    case 'enchant':
      return (
        <NameInput
          value={condition.name}
          onChange={(name) => onChange({ name })}
          entry={entry}
          placeholder="예: 울프헌터"
          label="인챈트 이름"
        />
      );
    case 'special':
      return (
        <>
          <Select
            value={condition.type}
            onChange={(type) => onChange({ type })}
            options={SPECIAL_OPTIONS}
            aria-label="특별 개조 종류"
            style={{ width: 150 }}
          />
          <InputNumber
            value={condition.minStep}
            onChange={(minStep) => onChange({ minStep: minStep ?? null })}
            min={1}
            max={10}
            precision={0}
            suffix="단계 이상"
            aria-label="특별 개조 최소 단계"
            className="tnum"
            style={{ width: 140 }}
          />
        </>
      );
    case 'erg':
      return (
        <>
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
            style={{ width: 130 }}
          />
          <InputNumber
            value={condition.minLevel}
            onChange={(minLevel) => onChange({ minLevel: minLevel ?? null })}
            min={1}
            max={50}
            precision={0}
            suffix="레벨 이상"
            aria-label="에르그 최소 레벨"
            className="tnum"
            style={{ width: 140 }}
          />
        </>
      );
    case 'color':
      return (
        <>
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
          <Flex gap={8} align="center" style={{ flex: '1 1 220px', minWidth: 200 }}>
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
        </>
      );
    case 'number':
      return (
        <InputNumber
          value={condition.min}
          onChange={(min) => onChange({ min: min ?? null })}
          suffix="이상"
          aria-label={`${numberLabel(condition.optionType)} 최솟값`}
          className="tnum"
          style={{ width: 160 }}
        />
      );
    case 'text':
      return (
        <NameInput
          value={condition.text}
          onChange={(text) => onChange({ text })}
          entry={entry}
          placeholder="들어 있는 문구"
          label={`${condition.optionType} 문구`}
        />
      );
  }
}
