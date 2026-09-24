import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LinkOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Col, Empty, Flex, Grid, Row, Typography } from 'antd';
import { HEADER_HEIGHT } from '@/app/theme';
import { RandomStatsPanel } from '@/components/equipment/RandomStatsPanel';
import { ReforgePanel } from '@/components/equipment/ReforgePanel';
import { SpecialUpgradePanel } from '@/components/equipment/SpecialUpgradePanel';
import { StatTable } from '@/components/equipment/StatTable';
import { UpgradePanel } from '@/components/equipment/UpgradePanel';
import { ItemCardSummary } from '@/components/ItemCardSummary';
import { QueryState } from '@/components/QueryState';
import { canLookupEquipment, useEquipmentQuery } from '@/features/equipment/api';
import { describeAbility } from '@/features/equipment/reforge';
import {
  computeStats,
  decodeState,
  encodeState,
  type SimulationParams,
  type SimulationState,
} from '@/features/equipment/simulate';
import type { EquipmentLookup, EquipmentRecord } from '@/features/equipment/types';
import { useItemCard, usePrefetchItemCards } from '@/features/itemcard/cards';

const { Text } = Typography;

/** 주소에 담는 조합 칸. `simulate.ts` 의 SimulationParams 와 같은 이름이다. */
const SIM_KEYS = ['rv', 'up', 'gm', 'rf', 'sp'] as const;

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
  params: SimulationParams;
  onParamsChange: (params: SimulationParams) => void;
}

function Simulator({ lookup, params, onParamsChange }: SimulatorProps) {
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const { item } = lookup;
  const upgrades = useMemo(() => lookup.upgrades ?? {}, [lookup.upgrades]);
  const abilities = useMemo(() => lookup.abilities ?? [], [lookup.abilities]);
  const levels = useMemo(() => lookup.levels ?? [], [lookup.levels]);

  const state = useMemo(
    () => decodeState(params, item, upgrades, abilities, levels),
    [params, item, upgrades, abilities, levels],
  );
  const rows = useMemo(() => computeStats(item, upgrades, state), [item, upgrades, state]);
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

  const specialLine =
    state.special.kind && item.special
      ? `특별 개조 ${state.special.kind.toUpperCase()} ${state.special.level}단계`
      : null;

  const hasAnything = Boolean(item.random?.length || item.upgrade || item.reforge || item.special);

  return (
    <Row gutter={[20, 20]}>
      {/* 결과를 왼쪽에 붙여 둔다. 992px 미만에서는 결과가 위, 고르는 칸이 아래로 떨어진다. */}
      <Col xs={24} lg={10}>
        {/* 넓은 화면에서는 고르는 동안 결과가 따라 내려온다. 좁은 화면에서는 붙이지 않는다. */}
        <Flex
          vertical
          gap={16}
          style={screens.lg ? { position: 'sticky', top: HEADER_HEIGHT + 16 } : undefined}
        >
          <Section
            title="최종 능력치"
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
              <StatTable rows={rows} />
              {reforgeLines.length || specialLine ? (
                <Flex vertical gap={4}>
                  <Text strong style={{ fontSize: 13 }}>
                    표 밖의 효과
                  </Text>
                  {reforgeLines.map((line, index) => (
                    <Text key={`${line}-${index}`} className="tnum">
                      세공 {line}
                    </Text>
                  ))}
                  {specialLine ? <Text>{specialLine} (수치 미포함)</Text> : null}
                </Flex>
              ) : null}
              <Text type="secondary" style={{ fontSize: 12 }}>
                고른 조합은 주소에 담깁니다. 링크를 저장해 두면 다음에 같은 조합으로 다시 열립니다.
              </Text>
            </Flex>
          </Section>
        </Flex>
      </Col>

      <Col xs={24} lg={14}>
        <Flex vertical gap={16}>
          {!hasAnything ? (
            <Card>
              <Empty description="이 장비에는 고를 수 있는 랜덤 능력치, 개조, 세공, 특별 개조가 없습니다." />
            </Card>
          ) : null}

          {item.random?.length ? (
            <Section title="랜덤 능력치">
              <RandomStatsPanel
                ranges={item.random}
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
 * 아이템 사전의 장비 상세. 기본 능력치에 랜덤 능력치와 개조를 더해 보고, 세공과 특별 개조를 골라 본다.
 *
 * 무엇을 골랐는지(조합)는 주소에 붙는다. 사전이 이미 주소에 담아 둔 카테고리와 이름은 건드리지
 * 않고 조합 칸만 바꾼다. 새로고침해도, 링크를 남에게 보내도 같은 화면이 열린다.
 * 서버에는 아무것도 저장하지 않는다.
 */
export function EquipmentDetail({ category, name }: { category: string; name: string }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo<SimulationParams>(() => {
    const picked: SimulationParams = {};
    for (const key of SIM_KEYS) {
      const value = searchParams.get(key);
      if (value) picked[key] = value;
    }
    return picked;
  }, [searchParams]);

  const setParams = (next: SimulationParams) => {
    setSearchParams(
      (current) => {
        const query = new URLSearchParams(current);
        for (const key of SIM_KEYS) {
          if (next[key]) query.set(key, next[key]);
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
          <Simulator lookup={{ ...lookup, item }} params={params} onParamsChange={setParams} />
        ) : null}
      </QueryState>

      {/* 어디서 온 값인지 섞이지 않게 적는다. 경매장 API 가 주는 값이 아니다. */}
      <Text type="secondary" style={{ fontSize: 12 }}>
        능력치와 개조, 세공 정보는 게임 클라이언트 데이터에서 모아 둔 것이며 경매장 API 가 주는 값이
        아닙니다.
        {lookup?.updated ? ` ${lookup.updated} 기준입니다.` : ''} 게임 업데이트 직후에는 실제와 다를
        수 있습니다.
      </Text>
    </Flex>
  );
}
