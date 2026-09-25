import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Card, Col, Divider, Flex, Grid, Row, Tooltip, Typography } from 'antd';
import { HEADER_HEIGHT } from '@/app/theme';
import { BaseStatsPanel } from '@/components/equipment/BaseStatsPanel';
import { EnchantPanel } from '@/components/equipment/EnchantPanel';
import { EquipmentPreview, type ReforgeLine } from '@/components/equipment/EquipmentPreview';
import { ErgPanel } from '@/components/equipment/ErgPanel';
import { ReforgePanel } from '@/components/equipment/ReforgePanel';
import { SpecialUpgradePanel } from '@/components/equipment/SpecialUpgradePanel';
import { UpgradePanel } from '@/components/equipment/UpgradePanel';
import { QueryState } from '@/components/QueryState';
import { canLookupEquipment, useEquipmentQuery } from '@/features/equipment/api';
import { availableGrades, ergSummary } from '@/features/equipment/erg';
import { describeAbility, highestLevel, levelRange } from '@/features/equipment/reforge';
import {
  SIMULATION_PARAM_KEYS,
  computeStats,
  decodeState,
  encodeState,
  selectedEnchants,
  selectedSpecial,
  selectedUpgrades,
  type SimulationParams,
  type SimulationState,
} from '@/features/equipment/simulate';
import type { EquipmentLookup, EquipmentRecord } from '@/features/equipment/types';
import { useItemCard, usePrefetchItemCards, type ItemCard } from '@/features/itemcard/cards';
import { EmptyState } from '@/components/EmptyState';
import { LinkIcon, RefreshIcon, SearchIcon } from '@/components/icons';

const { Text, Paragraph } = Typography;

function Section({
  title,
  extra,
  children,
  scrollBody = false,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
  /** 바깥 높이를 넘으면 머리는 두고 몸만 스크롤한다. 붙어 따라오는 미리보기가 쓴다. */
  scrollBody?: boolean;
}) {
  return (
    <Card
      size="small"
      title={title}
      extra={extra}
      style={scrollBody ? { display: 'flex', flexDirection: 'column', minHeight: 0 } : undefined}
      styles={scrollBody ? { body: { overflowY: 'auto', minHeight: 0 } } : undefined}
    >
      {children}
    </Card>
  );
}

interface SimulatorProps {
  lookup: EquipmentLookup & { item: EquipmentRecord };
  card: ItemCard | null | undefined;
  params: SimulationParams;
  onParamsChange: (params: SimulationParams) => void;
}

function Simulator({ lookup, card, params, onParamsChange }: SimulatorProps) {
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const { item } = lookup;
  const upgrades = useMemo(() => lookup.upgrades ?? {}, [lookup.upgrades]);
  const abilities = useMemo(() => lookup.abilities ?? [], [lookup.abilities]);
  const levels = useMemo(() => lookup.levels ?? [], [lookup.levels]);
  const enchants = useMemo(() => lookup.enchants ?? [], [lookup.enchants]);
  const erg = lookup.erg ?? null;

  const state = useMemo(
    () => decodeState(params, item, upgrades, abilities, levels, enchants, erg),
    [params, item, upgrades, abilities, levels, enchants, erg],
  );
  const rows = useMemo(
    () => computeStats(item, upgrades, state, enchants, erg),
    [item, upgrades, state, enchants, erg],
  );
  const update = (patch: Partial<SimulationState>) =>
    onParamsChange(encodeState(item, { ...state, ...patch }));

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      message.success('지금 고른 조합이 담긴 주소를 복사했습니다.');
    } catch {
      message.error('주소를 복사하지 못했습니다. 주소창의 주소를 직접 복사해 주세요.');
    }
  };

  const reforgeLines = state.reforge.options
    .map((pick): ReforgeLine | null => {
      const ability = abilities.find((entry) => entry.id === pick.abilityId);
      if (!ability || !item.reforge) return null;
      const range = levelRange(ability, state.reforge.rank, item.reforge.type, levels);
      return {
        name: ability.name,
        level: pick.level,
        max: highestLevel(range),
        effect: describeAbility(ability, pick.level),
      };
    })
    .filter((line): line is ReforgeLine => line !== null);

  const special =
    state.special.kind && item.special
      ? {
          label: `${state.special.kind.toUpperCase()} ${state.special.level}단계`,
          step: selectedSpecial(item, state),
        }
      : null;

  const hasAnything = Boolean(
    item.base ||
    item.random?.length ||
    item.upgrade ||
    item.reforge ||
    item.special ||
    enchants.length ||
    availableGrades(erg).length,
  );

  return (
    <Row gutter={[16, 16]}>
      {/* 미리보기를 왼쪽에 붙여 둔다. 992px 미만에서는 미리보기가 위, 고르는 칸이 아래로 떨어진다. */}
      <Col xs={24} lg={10}>
        {/*
          넓은 화면에서는 고르는 동안 미리보기가 따라 내려온다. 좁은 화면에서는 붙이지 않는다.
          미리보기가 화면보다 길면 오른쪽 칸 끝에 밀려 머리가 헤더 밑으로 잘렸다. 화면 높이 안에
          가두고 안에서 스크롤하게 한다.
        */}
        <div
          style={
            screens.lg
              ? {
                  position: 'sticky',
                  top: HEADER_HEIGHT + 16,
                  maxHeight: `calc(100dvh - ${HEADER_HEIGHT + 32}px)`,
                  display: 'flex',
                  flexDirection: 'column',
                }
              : undefined
          }
        >
          <Section
            scrollBody={screens.lg}
            title="장비 미리보기"
            extra={
              <Flex gap={4}>
                <Tooltip title="고른 조합이 주소에 담겨 있습니다. 링크를 저장해 두면 같은 조합으로 다시 열립니다.">
                  <Button size="small" icon={<LinkIcon />} onClick={() => void copyLink()}>
                    링크 복사
                  </Button>
                </Tooltip>
                <Button size="small" icon={<RefreshIcon />} onClick={() => onParamsChange({})}>
                  처음으로
                </Button>
              </Flex>
            }
          >
            <EquipmentPreview
              name={item.name}
              card={card}
              rows={rows}
              enchants={selectedEnchants(state.enchant, enchants)}
              upgrades={selectedUpgrades(state, upgrades)}
              upgradeCount={{
                done: state.slots.filter((id) => id !== null).length,
                max: state.slots.length,
                gemDone: state.gemSlots.filter((id) => id !== null).length,
                gemMax: state.gemSlots.length,
              }}
              reforge={reforgeLines}
              special={special}
              erg={ergSummary(erg, state.erg)}
            />
          </Section>
        </div>
      </Col>

      <Col xs={24} lg={14}>
        <Flex vertical gap={12}>
          {!hasAnything ? (
            <Card>
              <EmptyState description="이 장비에는 고를 수 있는 유동 능력치, 개조, 인챈트, 세공, 특별 개조가 없습니다." />
            </Card>
          ) : null}

          {item.base || item.random?.length ? (
            <Section title="기본 성능">
              <BaseStatsPanel
                item={item}
                values={state.random}
                onChange={(random) => update({ random })}
              />
            </Section>
          ) : null}

          {/*
            개조와 특별 개조는 같은 무기에 이어서 하는 일이라 한 섹션에 둔다. 고르는 칸은 나눈다.
          */}
          {item.upgrade || item.special ? (
            <Section
              title={
                item.upgrade
                  ? `개조 (일반 ${item.upgrade.max}회, 보석 ${item.upgrade.gemMax}회)`
                  : '개조'
              }
            >
              {item.upgrade ? (
                <UpgradePanel
                  item={item}
                  upgrades={upgrades}
                  slots={state.slots}
                  gemSlots={state.gemSlots}
                  onChange={(slots, gemSlots) => update({ slots, gemSlots })}
                />
              ) : null}
              {item.upgrade && item.special ? (
                <Divider
                  plain
                  titlePlacement="start"
                  style={{ margin: '12px 0 8px', fontSize: 13 }}
                >
                  특별 개조
                </Divider>
              ) : null}
              {item.special ? (
                <SpecialUpgradePanel
                  special={item.special}
                  kind={state.special.kind}
                  level={state.special.level}
                  onChange={(kind, level) => update({ special: { kind, level } })}
                />
              ) : null}
            </Section>
          ) : null}

          {enchants.length ? (
            <Section title="인챈트">
              <EnchantPanel
                category={item.category}
                enchants={enchants}
                pick={state.enchant}
                onChange={(enchant) => update({ enchant })}
              />
            </Section>
          ) : null}

          {item.reforge ? (
            <Section title="세공">
              <ReforgePanel
                equipType={item.reforge.type}
                abilities={abilities}
                levels={levels}
                options={state.reforge.options}
                onChange={(options) => update({ reforge: { rank: 1, options } })}
              />
            </Section>
          ) : null}

          {erg && availableGrades(erg).length ? (
            <Section title="에르그">
              <ErgPanel erg={erg} pick={state.erg} onChange={(next) => update({ erg: next })} />
            </Section>
          ) : null}
        </Flex>
      </Col>
    </Row>
  );
}

/**
 * 아이템 사전의 장비 상세. 기본 성능, 개조, 인챈트, 세공, 특별 개조를 골라 한 벌로 합쳐 본다.
 *
 * 무엇을 골랐는지(조합)는 주소에 붙는다. 사전이 이미 주소에 담아 둔 카테고리와 이름은 건드리지
 * 않고 조합 칸만 바꾼다. 새로고침해도, 링크를 남에게 보내도 같은 화면이 열린다.
 * 서버에는 아무것도 저장하지 않는다.
 */
export function EquipmentDetail({ category, name }: { category: string; name: string }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo<SimulationParams>(() => {
    const picked: SimulationParams = {};
    for (const key of SIMULATION_PARAM_KEYS) {
      const value = searchParams.get(key);
      if (value) picked[key] = value;
    }
    return picked;
  }, [searchParams]);

  const setParams = (next: SimulationParams) => {
    setSearchParams(
      (current) => {
        const query = new URLSearchParams(current);
        for (const key of SIMULATION_PARAM_KEYS) {
          const value = next[key];
          if (value) query.set(key, value);
          else query.delete(key);
        }
        return query;
      },
      // 값을 바꿀 때마다 방문 기록이 쌓이면 뒤로 가기로 사전 목록에 돌아갈 수 없다. 자리만 바꾼다.
      { replace: true },
    );
  };

  const query = useEquipmentQuery(category, name);
  const cardKeys = useMemo(() => [{ category, name }], [category, name]);
  usePrefetchItemCards(cardKeys);
  const card = useItemCard(category, name);

  const lookup = query.data;
  const item = lookup?.item ?? null;

  return (
    <Flex vertical gap={12}>
      {!canLookupEquipment() ? (
        <Alert
          type="warning"
          showIcon
          message="지금은 장비 정보를 볼 수 없습니다. 조회 서버 주소가 설정되지 않았습니다."
        />
      ) : null}

      {/*
        설명과 시세 버튼만 한 줄에. 그림과 이름은 바로 아래 미리보기에 있어 두 번 적지 않는다.
        설명은 두 줄까지만 보이고 "더 보기" 로 편다.
      */}
      <Card size="small">
        <Flex align="flex-start" justify="space-between" gap={12}>
          <Paragraph
            type="secondary"
            ellipsis={{ rows: 2, expandable: true, symbol: '더 보기' }}
            style={{ marginBottom: 0, whiteSpace: 'pre-line', flex: 1, minWidth: 0 }}
          >
            {card?.description || `${category} 카테고리의 장비입니다.`}
          </Paragraph>
          <Link
            to={`/auction?keyword=${encodeURIComponent(name)}&category=${encodeURIComponent(category)}`}
          >
            <Button size="small" icon={<SearchIcon />}>
              시세 보기
            </Button>
          </Link>
        </Flex>
      </Card>

      <QueryState
        isLoading={query.isLoading}
        error={query.error}
        isEmpty={query.isSuccess && item === null}
        emptyMessage="이 아이템은 장비 정보가 없습니다. 장비가 아니거나 아직 모으지 못한 아이템입니다."
      >
        {lookup && item ? (
          <Simulator
            lookup={{ ...lookup, item }}
            card={card}
            params={params}
            onParamsChange={setParams}
          />
        ) : null}
      </QueryState>

      {/* 어디서 온 값인지 섞이지 않게 적는다. 경매장 API 가 주는 값이 아니다. */}
      <Text type="secondary" style={{ fontSize: 12 }}>
        능력치와 개조, 인챈트, 세공 정보는 게임 클라이언트 데이터에서 모아 둔 것이며 경매장 API 가
        주는 값이 아닙니다.
        {lookup?.updated ? ` ${lookup.updated} 기준입니다.` : ''} 특별 개조 수치만 공개된 커뮤니티
        표에서 옮겼습니다. 게임 업데이트 직후에는 실제와 다를 수 있습니다.
      </Text>
    </Flex>
  );
}
