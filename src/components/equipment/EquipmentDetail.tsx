import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LinkOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Col, Empty, Flex, Grid, Row, Typography } from 'antd';
import { HEADER_HEIGHT } from '@/app/theme';
import { BaseStatsPanel } from '@/components/equipment/BaseStatsPanel';
import { EnchantPanel } from '@/components/equipment/EnchantPanel';
import { EquipmentPreview } from '@/components/equipment/EquipmentPreview';
import { ReforgePanel } from '@/components/equipment/ReforgePanel';
import { SpecialUpgradePanel } from '@/components/equipment/SpecialUpgradePanel';
import { UpgradePanel } from '@/components/equipment/UpgradePanel';
import { ItemCardSummary } from '@/components/ItemCardSummary';
import { QueryState } from '@/components/QueryState';
import { canLookupEquipment, useEquipmentQuery } from '@/features/equipment/api';
import { describeAbility } from '@/features/equipment/reforge';
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

const { Text } = Typography;

function Section({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card size="small" title={title} extra={extra}>
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

  const state = useMemo(
    () => decodeState(params, item, upgrades, abilities, levels, enchants),
    [params, item, upgrades, abilities, levels, enchants],
  );
  const rows = useMemo(
    () => computeStats(item, upgrades, state, enchants),
    [item, upgrades, state, enchants],
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
    .map((pick) => {
      const ability = abilities.find((entry) => entry.id === pick.abilityId);
      return ability ? describeAbility(ability, pick.level) : null;
    })
    .filter((line): line is string => line !== null);

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
    enchants.length,
  );

  return (
    <Row gutter={[20, 20]}>
      {/* 미리보기를 왼쪽에 붙여 둔다. 992px 미만에서는 미리보기가 위, 고르는 칸이 아래로 떨어진다. */}
      <Col xs={24} lg={10}>
        {/* 넓은 화면에서는 고르는 동안 미리보기가 따라 내려온다. 좁은 화면에서는 붙이지 않는다. */}
        <div style={screens.lg ? { position: 'sticky', top: HEADER_HEIGHT + 16 } : undefined}>
          <Section
            title="장비 미리보기"
            extra={
              <Flex gap={4}>
                <Button size="small" icon={<LinkOutlined />} onClick={() => void copyLink()}>
                  링크 복사
                </Button>
                <Button size="small" icon={<ReloadOutlined />} onClick={() => onParamsChange({})}>
                  처음으로
                </Button>
              </Flex>
            }
          >
            <Flex vertical gap={12}>
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
                reforgeLines={reforgeLines}
                special={special}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                고른 조합은 주소에 담깁니다. 링크를 저장해 두면 다음에 같은 조합으로 다시 열립니다.
              </Text>
            </Flex>
          </Section>
        </div>
      </Col>

      <Col xs={24} lg={14}>
        <Flex vertical gap={16}>
          {!hasAnything ? (
            <Card>
              <Empty description="이 장비에는 고를 수 있는 랜덤 능력치, 개조, 인챈트, 세공, 특별 개조가 없습니다." />
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

          {item.upgrade ? (
            <Section title={`개조 (일반 ${item.upgrade.max}회, 보석 ${item.upgrade.gemMax}회)`}>
              <UpgradePanel
                item={item}
                upgrades={upgrades}
                slots={state.slots}
                gemSlots={state.gemSlots}
                onChange={(slots, gemSlots) => update({ slots, gemSlots })}
              />
            </Section>
          ) : null}

          {enchants.length ? (
            <Section title="인챈트">
              <EnchantPanel
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
                rank={state.reforge.rank}
                options={state.reforge.options}
                onChange={(rank, options) => update({ reforge: { rank, options } })}
              />
            </Section>
          ) : null}

          {item.special ? (
            <Section title="특별 개조">
              <SpecialUpgradePanel
                special={item.special}
                kind={state.special.kind}
                level={state.special.level}
                onChange={(kind, level) => update({ special: { kind, level } })}
              />
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
    <Flex vertical gap={20}>
      {!canLookupEquipment() ? (
        <Alert
          type="warning"
          showIcon
          message="지금은 장비 정보를 볼 수 없습니다. 조회 서버 주소가 설정되지 않았습니다."
        />
      ) : null}

      <Card>
        <Flex vertical gap={16}>
          <ItemCardSummary card={card} title={name} rawName={name} category={category} />
          <div>
            <Link
              to={`/auction?keyword=${encodeURIComponent(name)}&category=${encodeURIComponent(category)}`}
            >
              <Button icon={<SearchOutlined />}>시세 보기</Button>
            </Link>
          </div>
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
