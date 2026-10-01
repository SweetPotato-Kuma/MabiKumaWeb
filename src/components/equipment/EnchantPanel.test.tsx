import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { EnchantPanel } from '@/components/equipment/EnchantPanel';
import type { EnchantDef } from '@/features/equipment/types';

const butterfly: EnchantDef = {
  id: 30655,
  name: '나비',
  alt: '버터플라이',
  slot: 0,
  level: 6,
  desc: ['마나실드 사용 중일 때 최대대미지 7~12 증가'],
  effects: [['attack_max', 7, 12, 1]],
};
const owl: EnchantDef = {
  id: 2,
  name: '올빼미',
  slot: 0,
  level: 8,
  desc: ['최대대미지 10 증가'],
  effects: [['attack_max', 10, 10]],
};

function renderPanel(pick = { prefix: null as number | null, suffix: null as number | null }) {
  return render(
    <AppProviders>
      <EnchantPanel category="검" enchants={[butterfly, owl]} pick={pick} onChange={() => {}} />
    </AppProviders>,
  );
}

describe('인챈트 목록의 이름', () => {
  it('경매장에서 보이는 이름 뒤에 첫 번째 이름을 괄호로 함께 적는다', () => {
    renderPanel();

    expect(screen.getByText('나비 (버터플라이)')).toBeInTheDocument();
    // 다른 이름이 없는 인챈트는 이름만 적는다.
    expect(screen.getByText('올빼미')).toBeInTheDocument();
  });

  it('두 이름 어느 쪽으로 찾아도 같은 인챈트가 나온다', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('radio', { name: '전체 2' }));
    const search = screen.getByLabelText('이름이나 효과로 찾기');

    fireEvent.change(search, { target: { value: '버터플라이' } });
    expect(screen.getByText('나비 (버터플라이)')).toBeInTheDocument();
    expect(screen.queryByText('올빼미')).toBeNull();

    fireEvent.change(search, { target: { value: '나비' } });
    expect(screen.getByText('나비 (버터플라이)')).toBeInTheDocument();
  });

  it('고른 인챈트도 두 이름으로 보여 준다', () => {
    renderPanel({ prefix: butterfly.id, suffix: null });

    expect(screen.getByText('A 랭크 나비 (버터플라이)')).toBeInTheDocument();
  });
});
