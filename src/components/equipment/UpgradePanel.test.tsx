import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { UpgradePanel } from '@/components/equipment/UpgradePanel';
import type { EquipmentRecord, UpgradeDef } from '@/features/equipment/types';

const NORMAL: UpgradeDef = { name: '이동 속도 증가', min: 0, max: 4, ep: 100, gold: 1000 } as UpgradeDef;
const GEM: UpgradeDef = { name: '루비 개조', min: 0, max: 1, ep: 50, gold: 500, gems: [['루비', 5]] } as UpgradeDef;

const itemWith = (ids: string[]) => ({ upgrade: { ids } }) as unknown as EquipmentRecord;

function renderPanel(item: EquipmentRecord, upgrades: Record<string, UpgradeDef>) {
  return render(
    <AppProviders>
      <UpgradePanel
        item={item}
        upgrades={upgrades}
        slots={[null, null, null, null, null]}
        gemSlots={[null, null]}
        onChange={() => {}}
      />
    </AppProviders>,
  );
}

describe('개조 칸', () => {
  it('할 수 있는 개조가 하나도 없으면 한 줄로만 알린다', () => {
    renderPanel(itemWith([]), {});

    expect(screen.getByText('이 아이템은 개조할 수 없습니다.')).toBeInTheDocument();
    // 칸마다 "할 수 있는 개조 없음" 이 반복되지 않는다.
    expect(screen.queryByText('할 수 있는 개조 없음')).toBeNull();
    expect(screen.queryByText('이 칸에 할 수 있는 개조가 없습니다')).toBeNull();
    expect(screen.queryByText('필요 숙련 합계')).toBeNull();
  });

  it('보석 개조만 되면 그 칸만 보인다', () => {
    renderPanel(itemWith(['gem']), { gem: GEM });

    expect(screen.getByText('보석 1')).toBeInTheDocument();
    expect(screen.getByText('보석 2')).toBeInTheDocument();
    expect(screen.queryByText('1번째')).toBeNull();
    expect(screen.queryByText('이 아이템은 개조할 수 없습니다.')).toBeNull();
  });

  it('일반 개조만 되면 보석 칸은 보이지 않는다', () => {
    renderPanel(itemWith(['normal']), { normal: NORMAL });

    expect(screen.getByText('1번째')).toBeInTheDocument();
    expect(screen.queryByText('보석 1')).toBeNull();
  });
});
