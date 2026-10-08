import { useMemo, useState, type CSSProperties } from 'react';
import {
  Button,
  Card,
  Col,
  Divider,
  Flex,
  Grid,
  InputNumber,
  Modal,
  Popover,
  Row,
  Segmented,
  Select,
  Statistic,
  Table,
  Tag,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { EmptyState } from '@/components/EmptyState';
import {
  AddIcon,
  CalculateIcon,
  CloseIcon,
  DeleteIcon,
  HexagonIcon,
  LockIcon,
  LockOpenIcon,
  ResetIcon,
  StarFillIcon,
} from '@/components/icons';
import { TrialCountInput, TrialOdds } from '@/components/simulator/TrialOdds';
import { useMarketPrices, type PriceState } from '@/features/crafting/market';
import { skillIconUrl } from '@/features/crafting/recipes';
import {
  activeCombinations,
  addSpent,
  COMBINATION_POINTS,
  combinationsOf,
  emptyLines,
  lineMeets,
  lockedCount,
  MAX_TARGETS,
  NO_SPENT,
  OGHAM_ARCANAS,
  OGHAM_WORDS,
  oghamArcana,
  oghamOption,
  oghamWord,
  oghamWordIconUrl,
  optionPool,
  optionTotals,
  optionUnit,
  optionValue,
  placeCombination,
  RELEVANCE_LABEL,
  relevanceOf,
  relevanceRank,
  REROLL_MATERIALS,
  rerollCost,
  rerollUntil,
  SLOT_COUNT,
  targetChance,
  type OghamArcana,
  type OghamCombination,
  type OghamLine,
  type OghamOption,
  type OghamSlot,
  type OghamSpent,
  type OghamTarget,
  type OghamWord,
  type OptionTotal,
} from '@/features/ogham/simulator';
import { formatChance } from '@/features/simulator/trials';
import { formatNumber } from '@/lib/format';
import { useGoldFormatter } from '@/lib/useGoldFormatter';

const { Text } = Typography;

/** 목표까지 자동으로 돌리는 횟수 상한. */
const AUTO_LIMITS = [1000, 2000] as const;

/** 오검 파편은 경매장에 오르지 않는다. 나머지 재료만 시세를 받는다. */
const UNLISTED_MATERIAL = '오검 파편';
const MARKET_MATERIALS = REROLL_MATERIALS.filter((name) => name !== UNLISTED_MATERIAL);

/**
 * 판 위 다섯 칸의 자리(판 크기에 대한 %). 위, 오른쪽, 오른쪽 아래, 왼쪽 아래, 왼쪽 순으로 오각형을 이룬다.
 */
const SLOT_POSITIONS = [
  { top: 18, left: 50 },
  { top: 42, left: 84 },
  { top: 80, left: 71 },
  { top: 80, left: 29 },
  { top: 42, left: 16 },
] as const;

const NUMERIC = { content: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } } as const;

/** 옵션 이름 한 줄 높이, 이름 아래 레벨 줄 높이. 줄 높이를 정해 두어 재설정해도 칸이 들썩이지 않는다. */
const NAME_LINE_HEIGHT = 20;
const META_HEIGHT = 22;
/** 옵션 한 줄의 높이. 이름 두 줄과 레벨 줄, 위아래 여백. */
const LINE_HEIGHT = NAME_LINE_HEIGHT * 2 + 2 + META_HEIGHT + 16;
const SMALL_TAG: CSSProperties = { marginInlineEnd: 0, fontSize: 12, lineHeight: '18px' };

/** 최대 레벨의 90% 이상인 줄. 금빛으로 강조한다. */
const HIGH_LEVEL_RATIO = 0.9;
const isHighLevel = (line: OghamLine) =>
  line.level / Math.max(1, oghamOption(line.option).maxLevel) >= HIGH_LEVEL_RATIO;

const formatValue = (value: number) => value.toLocaleString('ko-KR', { maximumFractionDigits: 4 });

/** "파이어 리프 어택 대미지 배율 증가 120%" 의 뒤쪽 수치. */
const valueText = (option: OghamOption, level: number) =>
  `${formatValue(optionValue(option, level))}${optionUnit(option)}`;

function lowestOf(state: PriceState | undefined): number | null {
  if (state?.status !== 'ok') return null;
  return state.price.offers[0]?.price ?? null;
}

/** 재료 시세. 이름마다 경매장 최저가, 없으면 null. */
type MaterialPrices = Map<string, number | null>;

/** 한 번 재설정의 골드 비용. 시세를 아는 재료까지 친다. 시세를 모르는 재료가 있으면 그 재료는 뺀다. */
function rerollGold(locked: number, prices: MaterialPrices): number | null {
  const cost = rerollCost(locked);
  if (!cost) return null;
  return cost.materials.reduce(
    (sum, material) => sum + (prices.get(material.name) ?? 0) * material.count,
    cost.gold,
  );
}

/** 워드 그림. 이름이 늘 곁에 있어 꾸밈으로 둔다. 자리를 미리 잡아 그림이 늦게 와도 칸이 들썩이지 않는다. */
function WordIcon({ word, size }: { word: OghamWord; size: number }) {
  return (
    <img
      src={oghamWordIconUrl(word.id) || undefined}
      alt=""
      width={size}
      height={size}
      draggable={false}
      style={{ display: 'block', flex: 'none' }}
    />
  );
}

/** 워드 그림과 이름. 판의 칸과 고르는 창이 같이 쓴다. */
function WordFace({ word, size }: { word: OghamWord; size: number }) {
  return (
    <Flex vertical align="center" gap={2} style={{ lineHeight: 1.1 }}>
      <WordIcon word={word} size={Math.round(size * 0.6)} />
      <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{word.name}</span>
    </Flex>
  );
}

/** 고르는 창의 워드 단추. 다른 칸에 이미 들어간 워드는 고를 수 없다. */
function WordButton({
  word,
  disabled,
  onPick,
}: {
  word: OghamWord;
  disabled: boolean;
  onPick: (word: OghamWord) => void;
}) {
  return (
    <Button
      onClick={() => onPick(word)}
      disabled={disabled}
      aria-label={`${word.name}, ${word.arcanaOptions ? '특수 오검' : '일반 오검'}`}
      style={{ width: 72, height: 64, padding: 4 }}
    >
      <WordFace word={word} size={56} />
    </Button>
  );
}

const WORD_GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
  gap: 8,
};

/** 빈 칸이나 바꿀 칸에 넣을 워드를 고르는 창. 위에 그 아르카나의 조합을 두어 한 번에 셋을 넣게 한다. */
function WordPicker({
  open,
  arcana,
  slots,
  slot,
  onPick,
  onPickCombination,
  onClose,
}: {
  open: boolean;
  arcana: OghamArcana;
  slots: readonly (OghamSlot | null)[];
  slot: number | null;
  onPick: (word: OghamWord) => void;
  onPickCombination: (combination: OghamCombination) => void;
  onClose: () => void;
}) {
  const own = slot === null ? null : (slots[slot]?.word ?? null);
  const placed = new Set(slots.filter(Boolean).map((each) => each!.word));
  const empty = slots.filter((each) => each === null).length;
  const taken = (word: OghamWord) => placed.has(word.id) && word.id !== own;
  const arcanaWords = OGHAM_WORDS.filter((word) => word.arcanaOptions);
  const otherWords = OGHAM_WORDS.filter((word) => !word.arcanaOptions);
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title="오검 워드 고르기"
      width={560}
      destroyOnHidden
    >
      <Flex vertical gap={16}>
        <section aria-label={`${arcana.name} 조합`}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            {arcana.name} 조합
          </Text>
          <Flex vertical gap={8}>
            {combinationsOf(arcana.id).map((combination) => {
              const missing = combination.words.filter((id) => !placed.has(id)).length;
              return (
                <Flex key={combination.id} gap={8} align="center" wrap>
                  <Text style={{ flex: '1 1 160px', minWidth: 0 }}>
                    {combination.skill ?? '스킬'}: {combination.name}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {combination.words.map((id) => oghamWord(id).name).join(', ')}
                  </Text>
                  <Button
                    size="small"
                    disabled={missing === 0 || missing > empty}
                    onClick={() => onPickCombination(combination)}
                  >
                    빈 칸에 넣기
                  </Button>
                </Flex>
              );
            })}
          </Flex>
        </section>
        <section aria-label="특수 오검">
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            특수 오검
          </Text>
          <div style={WORD_GRID}>
            {arcanaWords.map((word) => (
              <WordButton key={word.id} word={word} disabled={taken(word)} onPick={onPick} />
            ))}
          </div>
        </section>
        <section aria-label="일반 오검">
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            일반 오검
          </Text>
          <div style={WORD_GRID}>
            {otherWords.map((word) => (
              <WordButton key={word.id} word={word} disabled={taken(word)} onPick={onPick} />
            ))}
          </div>
        </section>
      </Flex>
    </Modal>
  );
}

/** 조합 효과가 붙는 스킬의 그림. 이름이 곁에 있어 꾸밈으로 둔다. */
function SkillIcon({ combination, size }: { combination: OghamCombination; size: number }) {
  return (
    <img
      src={skillIconUrl(combination.skillId) || undefined}
      alt=""
      width={size}
      height={size}
      draggable={false}
      style={{ display: 'block', flex: 'none' }}
    />
  );
}

/** 다섯 칸 판. 가운데에 발동한 조합의 스킬 그림을 둔다. */
function OghamBoard({
  slots,
  selected,
  combination,
  onSlot,
}: {
  slots: readonly (OghamSlot | null)[];
  selected: number | null;
  combination: OghamCombination | null;
  onSlot: (index: number) => void;
}) {
  const { token } = theme.useToken();
  const slotSize = 68;
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 300,
        aspectRatio: '1 / 1',
        borderRadius: token.borderRadiusLG,
        border: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorFillQuaternary,
      }}
    >
      {slots.map((slot, index) => {
        const position = SLOT_POSITIONS[index];
        const word = slot ? oghamWord(slot.word) : null;
        const active = selected === index;
        return (
          <button
            key={index}
            type="button"
            onClick={() => onSlot(index)}
            aria-label={word ? `${index + 1}번 칸 ${word.name}` : `${index + 1}번 칸 비어 있음`}
            aria-pressed={word ? active : undefined}
            style={{
              position: 'absolute',
              top: `${position.top}%`,
              left: `${position.left}%`,
              transform: 'translate(-50%, -50%)',
              width: slotSize,
              height: slotSize,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              cursor: 'pointer',
              color: word ? token.colorText : token.colorTextSecondary,
              background: token.colorBgContainer,
              borderRadius: token.borderRadius,
              border: active
                ? `2px solid ${token.colorPrimary}`
                : `1px ${word ? 'solid' : 'dashed'} ${token.colorBorder}`,
              fontFamily: 'inherit',
            }}
          >
            {word ? <WordFace word={word} size={slotSize} /> : <AddIcon style={{ fontSize: 22 }} />}
          </button>
        );
      })}
      <div
        role="status"
        aria-label={
          combination
            ? `발동한 조합 ${combination.skill ?? ''} ${combination.name}`
            : '발동한 조합 없음'
        }
        style={{
          position: 'absolute',
          top: '52%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 96,
          height: 84,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          padding: 6,
          textAlign: 'center',
          borderRadius: token.borderRadius,
          border: `1px solid ${combination ? token.colorPrimary : token.colorBorderSecondary}`,
          background: combination ? token.colorPrimaryBg : 'transparent',
        }}
      >
        {combination ? (
          <>
            <SkillIcon combination={combination} size={40} />
            <Text strong style={{ fontSize: 12, lineHeight: 1.25, color: token.colorPrimary }}>
              {combination.name}
            </Text>
          </>
        ) : (
          <HexagonIcon style={{ fontSize: 28, color: token.colorTextTertiary }} />
        )}
      </div>
    </div>
  );
}

/**
 * 옵션 한 줄의 이름과 수치. 그 아르카나에게 쓸모 있는 옵션은 무리 이름을, 목표를 채운 줄은 "목표" 를 붙인다.
 * 이름은 두 줄까지 보이고 아래 줄은 높이를 정해 두어, 재설정할 때마다 줄 높이가 바뀌지 않는다.
 */
function LineText({ line, arcana, hit }: { line: OghamLine; arcana: OghamArcana; hit: boolean }) {
  const { token } = theme.useToken();
  const option = oghamOption(line.option);
  const relevance = relevanceOf(option, arcana);
  const high = isHighLevel(line);
  return (
    <Flex vertical gap={2} style={{ minWidth: 0 }}>
      <Text
        strong={relevance !== null}
        title={`${option.name} ${valueText(option, line.level)}`}
        style={{
          lineHeight: `${NAME_LINE_HEIGHT}px`,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {option.name}{' '}
        <span className="tnum" style={high ? { color: token.gold8, fontWeight: 700 } : undefined}>
          {valueText(option, line.level)}
        </span>
      </Text>
      <Flex gap={6} align="center" style={{ height: META_HEIGHT }}>
        {high ? (
          // 최대 레벨의 90% 이상. 다른 시뮬레이터의 최상위 결과처럼 금빛으로 칠하고 별을 붙인다.
          <Text
            className="tnum"
            strong
            style={{ fontSize: 12, color: token.gold8, display: 'inline-flex', gap: 2 }}
          >
            <StarFillIcon aria-hidden />
            레벨 {line.level}/{option.maxLevel}
          </Text>
        ) : (
          <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
            레벨 {line.level}/{option.maxLevel}
          </Text>
        )}
        {relevance ? <Tag style={SMALL_TAG}>{RELEVANCE_LABEL[relevance]}</Tag> : null}
        {hit ? (
          <Tag
            style={{
              ...SMALL_TAG,
              color: token.colorPrimary,
              borderColor: token.colorPrimary,
              background: 'transparent',
            }}
          >
            목표
          </Tag>
        ) : null}
      </Flex>
    </Flex>
  );
}

/** 목표 옵션을 고르는 칸의 목록. 그 아르카나에게 쓸모 있는 무리부터. */
function targetOptions(pool: readonly OghamOption[], arcana: OghamArcana) {
  const groups = new Map<string, { label: string; options: { value: number; label: string }[] }>();
  const sorted = [...pool].sort((a, b) => relevanceRank(a, arcana) - relevanceRank(b, arcana));
  for (const option of sorted) {
    const relevance = relevanceOf(option, arcana);
    const label = relevance ? RELEVANCE_LABEL[relevance] : '그 밖';
    const group = groups.get(label) ?? { label, options: [] };
    group.options.push({ value: option.id, label: `${option.name} (최대 ${option.maxLevel})` });
    groups.set(label, group);
  }
  return [...groups.values()];
}

/**
 * 목표 옵션 고르기. 세 개까지, 옵션마다 바라는 가장 낮은 레벨. 셋 가운데 먼저 나오는 것을 잠그고 이어
 * 돌린다. 옵션이 백 개 가까이 되어 미리 아무 옵션이나 넣어 두지 않고, 빈 칸에서 골라 더한다.
 */
function TargetEditor({
  pool,
  arcana,
  targets,
  onChange,
}: {
  pool: readonly OghamOption[];
  arcana: OghamArcana;
  targets: OghamTarget[];
  onChange: (targets: OghamTarget[]) => void;
}) {
  const choices = (except: number | null) => {
    const used = new Set(targets.map((target) => target.option).filter((id) => id !== except));
    return targetOptions(
      pool.filter((option) => !used.has(option.id)),
      arcana,
    );
  };
  const replace = (index: number, target: OghamTarget | null) => {
    const next = [...targets];
    if (target) next[index] = target;
    else next.splice(index, 1);
    onChange(next);
  };

  return (
    <Flex vertical gap={6}>
      {targets.map((target, index) => {
        const option = oghamOption(target.option);
        return (
          // 좁으면 옵션 칸이 한 줄을 다 쓰고 레벨과 빼기 단추가 아랫줄로 내려간다.
          <Flex key={target.option} gap={8} align="center" wrap>
            <Select<number>
              aria-label={`목표 옵션 ${index + 1}`}
              showSearch
              optionFilterProp="label"
              value={target.option}
              onChange={(id) => replace(index, { option: id, minLevel: oghamOption(id).maxLevel })}
              options={choices(target.option)}
              popupMatchSelectWidth={false}
              style={{ flex: '1 1 220px', minWidth: 0 }}
            />
            <InputNumber<number>
              aria-label={`목표 옵션 ${index + 1}의 가장 낮은 레벨`}
              min={1}
              max={option.maxLevel}
              value={target.minLevel}
              onChange={(level) => {
                if (level === null) return;
                replace(index, {
                  ...target,
                  minLevel: Math.min(Math.max(Math.round(level), 1), option.maxLevel),
                });
              }}
              suffix="레벨 이상"
              className="tnum"
              style={{ width: 128, flex: 'none' }}
            />
            <Button
              type="text"
              icon={<DeleteIcon />}
              aria-label={`목표 옵션 ${index + 1} 빼기`}
              onClick={() => replace(index, null)}
            />
          </Flex>
        );
      })}
      {targets.length < MAX_TARGETS ? (
        <Select<number>
          aria-label="목표 옵션 추가"
          showSearch
          optionFilterProp="label"
          placeholder={targets.length === 0 ? '예: 스매시 대미지 배율 증가' : '목표 옵션 추가'}
          value={null}
          onChange={(id) =>
            onChange([...targets, { option: id, minLevel: oghamOption(id).maxLevel }])
          }
          options={choices(null)}
          popupMatchSelectWidth={false}
          style={{ width: '100%' }}
        />
      ) : null}
    </Flex>
  );
}

/** 고른 칸의 옵션 세 줄과 재설정. */
function RerollPanel({
  slot,
  arcana,
  prices,
  onReplace,
  onRemove,
  onChange,
}: {
  slot: OghamSlot;
  arcana: OghamArcana;
  prices: MaterialPrices;
  onReplace: () => void;
  onRemove: () => void;
  /** 줄이 바뀌었다. tries 번 재설정했고 그때 잠근 줄은 locked 개다. */
  onChange: (lines: (OghamLine | null)[], tries: number, locked: number) => void;
}) {
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const formatGold = useGoldFormatter();
  const word = oghamWord(slot.word);
  const pool = useMemo(() => optionPool(word), [word]);
  const locked = lockedCount(slot.lines);
  const cost = rerollCost(locked);
  const perTry = rerollGold(locked, prices);
  const [targets, setTargets] = useState<OghamTarget[]>([]);
  const [message, setMessage] = useState('');
  const [calcOpen, setCalcOpen] = useState(false);
  const [trials, setTrials] = useState(100);
  const chance = targetChance(slot.lines, pool, targets);

  const run = (limit: number | null) => {
    const result = rerollUntil(slot.lines, pool, limit === null ? [] : targets, limit ?? 1);
    onChange(result.lines, result.tries, locked);
    if (limit === null) setMessage('');
    else
      setMessage(
        result.hit
          ? `${formatNumber(result.tries)}번 만에 목표 옵션이 나왔습니다.`
          : `${formatNumber(limit)}번 동안 목표 옵션이 나오지 않았습니다.`,
      );
  };

  const toggleLock = (index: number) => {
    const line = slot.lines[index];
    if (!line) return;
    const next = [...slot.lines];
    next[index] = { ...line, locked: !line.locked };
    onChange(next, 0, locked);
  };

  return (
    <Flex vertical gap={14}>
      <Flex gap={12} align="center" wrap>
        <Flex
          align="center"
          justify="center"
          style={{
            width: 64,
            height: 64,
            borderRadius: token.borderRadius,
            border: `1px solid ${token.colorBorder}`,
            background: token.colorBgContainer,
          }}
        >
          <WordFace word={word} size={64} />
        </Flex>
        <Flex vertical gap={2} style={{ flex: 1, minWidth: 120 }}>
          <Text strong style={{ fontSize: 16 }}>
            {word.name}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {word.arcanaOptions ? '특수 오검' : '일반 오검'}
          </Text>
        </Flex>
        <Flex gap={8}>
          <Button size="small" onClick={onReplace}>
            워드 바꾸기
          </Button>
          <Button size="small" danger onClick={onRemove}>
            빼기
          </Button>
        </Flex>
      </Flex>

      <section aria-label="현재 옵션">
        <Flex vertical>
          {slot.lines.map((line, index) => (
            <Flex
              key={index}
              gap={8}
              align="center"
              style={{
                height: LINE_HEIGHT,
                // 여백은 모든 줄이 같게 두고 바탕만 칠한다. 90% 이상 줄만 칸이 달라지지 않게 한다.
                paddingInline: 8,
                borderTop: index === 0 ? undefined : `1px solid ${token.colorBorderSecondary}`,
                background: line && isHighLevel(line) ? token.gold1 : undefined,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                {line ? (
                  <LineText
                    line={line}
                    arcana={arcana}
                    hit={targets.some((target) => lineMeets(line, target))}
                  />
                ) : (
                  <Text type="secondary">재설정 전</Text>
                )}
              </div>
              <Button
                size="small"
                type={line?.locked ? 'primary' : 'default'}
                icon={line?.locked ? <LockIcon /> : <LockOpenIcon />}
                disabled={!line}
                aria-pressed={line?.locked ?? false}
                aria-label={`${index + 1}번째 줄 ${line?.locked ? '잠금 풀기' : '잠그기'}`}
                onClick={() => toggleLock(index)}
              />
            </Flex>
          ))}
        </Flex>
      </section>

      <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
        {cost
          ? `한 번에 ${formatGold(cost.gold)}, ${cost.materials
              .map((material) => `${material.name} ${formatNumber(material.count)}개`)
              .join(', ')} (잠금 ${locked}줄)`
          : '세 줄을 모두 잠가 재설정할 수 없습니다.'}
      </Text>

      <Divider style={{ margin: 0 }} />

      <Flex vertical gap={8}>
        <Text strong>목표 옵션</Text>
        <TargetEditor
          pool={pool}
          arcana={arcana}
          targets={targets}
          onChange={(next) => {
            setMessage('');
            setTargets(next);
          }}
        />
        {targets.length > 0 ? (
          <Flex gap={8} align="center" wrap>
            <Text className="tnum" style={{ fontSize: 13 }}>
              {chance > 0 ? (
                <>
                  한 번에 <Text strong>{formatChance(chance)}</Text>, 평균{' '}
                  <Text strong>{formatNumber(Math.ceil(1 / chance))}번</Text>에 한 번
                </>
              ) : (
                '잠그지 않은 줄에서 나올 목표 옵션이 없습니다.'
              )}
            </Text>
            {chance > 0 ? (
              <Popover
                open={calcOpen}
                trigger={[]}
                placement={screens.md ? 'bottomLeft' : 'bottom'}
                title={
                  <Flex justify="space-between" align="center" gap={8}>
                    <span>목표 옵션 기댓값</span>
                    <Button
                      type="text"
                      size="small"
                      icon={<CloseIcon />}
                      aria-label="목표 옵션 기댓값 닫기"
                      onClick={() => setCalcOpen(false)}
                    />
                  </Flex>
                }
                content={
                  <Flex vertical gap={10} style={{ width: 'min(400px, calc(100vw - 88px))' }}>
                    <TrialCountInput value={trials} onChange={setTrials} />
                    <TrialOdds
                      framed={false}
                      trials={trials}
                      chance={chance}
                      verb="재설정"
                      costPerTrial={perTry}
                    />
                  </Flex>
                }
              >
                <Button
                  size="small"
                  icon={<CalculateIcon />}
                  aria-expanded={calcOpen}
                  onClick={() => setCalcOpen(!calcOpen)}
                >
                  목표 옵션 기댓값
                </Button>
              </Popover>
            ) : null}
          </Flex>
        ) : null}
      </Flex>

      <Flex gap={8} wrap>
        <Button type="primary" disabled={!cost} onClick={() => run(null)}>
          재설정
        </Button>
        {AUTO_LIMITS.map((limit) => (
          <Button key={limit} disabled={!cost || chance <= 0} onClick={() => run(limit)}>
            목표까지 최대 {formatNumber(limit)}번
          </Button>
        ))}
      </Flex>
      {/* 결과 문구 자리는 비어 있을 때도 잡아 둔다. 문구가 뜨고 질 때 아래가 밀리지 않게 한다. */}
      <Text strong role="status" className="tnum" style={{ minHeight: 22, lineHeight: '22px' }}>
        {message}
      </Text>
    </Flex>
  );
}

/** 조합 도우미. 그 아르카나의 조합과 점수별 효과. */
function CombinationGuide({
  arcana,
  slots,
  active,
  onPlace,
}: {
  arcana: OghamArcana;
  slots: readonly (OghamSlot | null)[];
  active: OghamCombination | null;
  onPlace: (combination: OghamCombination) => void;
}) {
  const { token } = theme.useToken();
  const combinations = combinationsOf(arcana.id);
  const [picked, setPicked] = useState<number | null>(null);
  const [point, setPoint] = useState<number>(COMBINATION_POINTS[COMBINATION_POINTS.length - 1]);
  const shown =
    combinations.find((combination) => combination.id === picked) ?? active ?? combinations[0];
  const placed = new Set(slots.filter(Boolean).map((slot) => slot!.word));
  const empty = slots.filter((slot) => slot === null).length;
  const effect = shown?.effects[String(point)] ?? null;

  return (
    <Card title="조합" size="small">
      <Flex vertical gap={14}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 10,
          }}
        >
          {combinations.map((combination) => {
            const missing = combination.words.filter((id) => !placed.has(id)).length;
            const isShown = combination.id === shown?.id;
            return (
              <Flex
                key={combination.id}
                vertical
                gap={8}
                style={{
                  padding: '10px 12px',
                  borderRadius: token.borderRadius,
                  border: `1px solid ${isShown ? token.colorPrimary : token.colorBorderSecondary}`,
                }}
              >
                <Flex gap={6} align="center" wrap>
                  <Text strong>{combination.name}</Text>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {combination.skill}
                  </Text>
                  {combination.id === active?.id ? (
                    <Tag
                      style={{
                        marginInlineEnd: 0,
                        color: token.colorPrimary,
                        borderColor: token.colorPrimary,
                        background: 'transparent',
                      }}
                    >
                      발동
                    </Tag>
                  ) : null}
                </Flex>
                <Flex gap={6} wrap>
                  {combination.words.map((id) => {
                    const word = oghamWord(id);
                    const has = placed.has(id);
                    return (
                      <Tag
                        key={id}
                        aria-label={has ? `${word.name}, 넣음` : word.name}
                        icon={<WordIcon word={word} size={16} />}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          marginInlineEnd: 0,
                          fontWeight: has ? 600 : undefined,
                          color: has ? token.colorText : token.colorTextSecondary,
                          borderStyle: has ? 'solid' : 'dashed',
                        }}
                      >
                        {word.name}
                      </Tag>
                    );
                  })}
                </Flex>
                <Flex gap={8} wrap>
                  <Button
                    size="small"
                    disabled={missing === 0 || missing > empty}
                    onClick={() => onPlace(combination)}
                  >
                    빈 칸에 넣기
                  </Button>
                  <Button
                    size="small"
                    type={isShown ? 'primary' : 'default'}
                    aria-pressed={isShown}
                    onClick={() => setPicked(combination.id)}
                  >
                    효과 보기
                  </Button>
                </Flex>
              </Flex>
            );
          })}
        </div>
        {shown ? (
          <Flex vertical gap={10}>
            <Flex gap={8} align="center" wrap>
              <Text strong>
                {shown.skill}: {shown.name}
              </Text>
              <Segmented<number>
                aria-label="조합 점수"
                size="small"
                value={point}
                onChange={setPoint}
                options={COMBINATION_POINTS.map((each) => ({ value: each, label: `${each}점` }))}
              />
            </Flex>
            {effect ? (
              <Text
                style={{ whiteSpace: 'pre-line', fontSize: 13, lineHeight: 1.6, maxWidth: '65ch' }}
              >
                {effect}
              </Text>
            ) : (
              <Text type="secondary" style={{ fontSize: 13 }}>
                아직 알려지지 않은 효과입니다.
              </Text>
            )}
          </Flex>
        ) : null}
      </Flex>
    </Card>
  );
}

/** 합계 칸의 높이. 재설정할 때마다 옵션 수가 바뀌어도 판 칸이 늘고 줄지 않게 높이를 정해 두고 안에서 넘긴다. */
const TOTALS_HEIGHT = 320;

/** 다섯 칸의 옵션을 옵션별로 더한 표. 판 아래에 두어 재설정하며 바로 본다. */
function TotalsTable({ rows, arcana }: { rows: OptionTotal[]; arcana: OghamArcana }) {
  const { token } = theme.useToken();
  const columns: TableColumnsType<OptionTotal> = [
    {
      title: '옵션',
      key: 'option',
      render: (_value, row) => {
        const relevance = relevanceOf(row.option, arcana);
        return (
          <Flex gap={6} align="center" wrap>
            <Text strong={relevance !== null} style={{ fontSize: 13 }}>
              {row.option.name}
            </Text>
            {relevance ? <Tag style={SMALL_TAG}>{RELEVANCE_LABEL[relevance]}</Tag> : null}
          </Flex>
        );
      },
    },
    {
      title: '합계',
      key: 'value',
      width: 96,
      align: 'right',
      render: (_value, row) => (
        <Flex vertical align="flex-end">
          <Text strong className="tnum" style={{ whiteSpace: 'nowrap' }}>
            {formatValue(row.valueSum)}
            {optionUnit(row.option)}
          </Text>
          <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            레벨 {formatNumber(row.levelSum)}
          </Text>
        </Flex>
      ),
    },
  ];
  return (
    <section
      aria-label="옵션 합계"
      style={{
        width: '100%',
        height: TOTALS_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadius,
        overflow: 'hidden',
      }}
    >
      <Text strong style={{ padding: '10px 12px' }}>
        옵션 합계
      </Text>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <Table<OptionTotal>
          columns={columns}
          dataSource={rows}
          rowKey={(row) => row.option.id}
          size="small"
          pagination={false}
          locale={{ emptyText: '재설정한 옵션이 아직 없습니다.' }}
        />
      </div>
    </section>
  );
}

const emptySlots = (): (OghamSlot | null)[] => Array.from({ length: SLOT_COUNT }, () => null);

/**
 * 오검 워드 옵션 시뮬레이터. 아르카나를 고르고 다섯 칸에 워드를 넣은 뒤, 칸을 골라 옵션 세 줄을 재설정한다.
 * 쓴 비용은 재설정한 횟수마다 그때 잠근 줄 수의 비용을 더한다.
 */
export function OghamSimulatorView() {
  const formatGold = useGoldFormatter();
  const { token } = theme.useToken();
  const [arcanaId, setArcanaId] = useState(OGHAM_ARCANAS[0].id);
  const arcana = oghamArcana(arcanaId);
  const [slots, setSlots] = useState<(OghamSlot | null)[]>(emptySlots);
  const [selected, setSelected] = useState<number | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const [spent, setSpent] = useState<OghamSpent>(NO_SPENT);

  const priceStates = useMarketPrices(MARKET_MATERIALS);
  const prices: MaterialPrices = useMemo(
    () => new Map(MARKET_MATERIALS.map((name) => [name, lowestOf(priceStates.get(name))])),
    [priceStates],
  );
  const pricesLoading = MARKET_MATERIALS.some(
    (name) => priceStates.get(name)?.status === 'loading',
  );

  const active = activeCombinations(arcana.id, slots)[0] ?? null;
  const totals = useMemo(() => optionTotals(slots, arcana), [slots, arcana]);
  const current = selected === null ? null : slots[selected];

  const materialGold = MARKET_MATERIALS.reduce(
    (sum, name) => sum + (prices.get(name) ?? 0) * (spent.materials[name] ?? 0),
    0,
  );

  const openSlot = (index: number) => {
    if (slots[index]) setSelected(index);
    else setPicking(index);
  };

  const pickWord = (word: OghamWord) => {
    if (picking === null) return;
    const next = [...slots];
    // 같은 워드로 바꾸면 붙어 있던 옵션을 그대로 둔다.
    if (next[picking]?.word !== word.id) next[picking] = { word: word.id, lines: emptyLines() };
    setSlots(next);
    setSelected(picking);
    setPicking(null);
  };

  const pickCombination = (combination: OghamCombination) => {
    setSlots(placeCombination(slots, combination));
    setPicking(null);
  };

  return (
    <Flex vertical gap={16} style={{ minWidth: 0 }}>
      <Card variant="outlined" role="region" aria-label="오검 워드 판">
        {/* 판과 고른 칸 두 칸. 768px 미만에서는 위아래로 쌓는다. */}
        <Row gutter={[24, 20]} align="stretch">
          <Col xs={24} md={10} xl={9}>
            <Flex vertical gap={12} align="center">
              <Flex vertical gap={4} style={{ width: '100%', maxWidth: 300 }}>
                <label htmlFor="ogham-arcana">
                  <Text strong style={{ fontSize: 13 }}>
                    아르카나
                  </Text>
                </label>
                <Select<number>
                  id="ogham-arcana"
                  value={arcanaId}
                  onChange={setArcanaId}
                  options={OGHAM_ARCANAS.map((each) => ({ value: each.id, label: each.name }))}
                />
              </Flex>
              <OghamBoard
                slots={slots}
                selected={selected}
                combination={active}
                onSlot={openSlot}
              />
              <Button
                icon={<ResetIcon />}
                disabled={slots.every((slot) => slot === null) && spent.count === 0}
                onClick={() => {
                  setSlots(emptySlots());
                  setSelected(null);
                  setSpent(NO_SPENT);
                }}
              >
                처음부터
              </Button>
              <TotalsTable rows={totals} arcana={arcana} />
            </Flex>
          </Col>
          <Col xs={24} md={14} xl={15}>
            <section
              aria-label="고른 워드"
              style={{
                height: '100%',
                minHeight: 280,
                padding: 16,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadius,
              }}
            >
              {current && selected !== null ? (
                <RerollPanel
                  key={`${selected}-${current.word}`}
                  slot={current}
                  arcana={arcana}
                  prices={prices}
                  onReplace={() => setPicking(selected)}
                  onRemove={() => {
                    const next = [...slots];
                    next[selected] = null;
                    setSlots(next);
                    setSelected(null);
                  }}
                  onChange={(lines, tries, locked) => {
                    const next = [...slots];
                    next[selected] = { ...current, lines };
                    setSlots(next);
                    if (tries > 0) setSpent((prev) => addSpent(prev, locked, tries));
                  }}
                />
              ) : (
                <Flex align="center" justify="center" style={{ height: '100%' }}>
                  <EmptyState
                    variant="search"
                    description="판의 칸을 누르면 워드를 넣고 옵션을 재설정합니다."
                  />
                </Flex>
              )}
            </section>
          </Col>
        </Row>

        <Divider style={{ marginBlock: 16 }} />

        <Flex vertical gap={14}>
          <Row gutter={[24, 16]} align="top">
            <Col xs={12} sm={8} lg={4}>
              <Statistic
                title="재설정"
                value={formatNumber(spent.count)}
                suffix="번"
                styles={NUMERIC}
              />
            </Col>
            <Col xs={24} sm={8} lg={5}>
              <Statistic
                title="쓴 골드"
                value={formatGold(spent.gold + materialGold)}
                loading={pricesLoading}
                styles={NUMERIC}
              />
            </Col>
            {REROLL_MATERIALS.map((name) => (
              <Col key={name} xs={12} sm={8} lg={5}>
                <Statistic
                  title={name}
                  value={formatNumber(spent.materials[name] ?? 0)}
                  suffix="개"
                  styles={NUMERIC}
                />
              </Col>
            ))}
          </Row>
          <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
            {MARKET_MATERIALS.map((name) => {
              const price = prices.get(name);
              return price == null ? `${name} 시세 없음` : `${name} 최저가 ${formatGold(price)}`;
            }).join(', ')}
            . 쓴 골드는 재설정 골드에 시세가 있는 재료값을 더한 것입니다. 게임 데이터는 평균 10분
            지연됩니다.
          </Text>
        </Flex>
      </Card>

      <CombinationGuide
        key={arcana.id}
        arcana={arcana}
        slots={slots}
        active={active}
        onPlace={(combination) => setSlots(placeCombination(slots, combination))}
      />

      <WordPicker
        open={picking !== null}
        arcana={arcana}
        slots={slots}
        slot={picking}
        onPick={pickWord}
        onPickCombination={pickCombination}
        onClose={() => setPicking(null)}
      />
    </Flex>
  );
}
