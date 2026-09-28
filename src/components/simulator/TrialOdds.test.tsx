import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { TrialOdds } from './TrialOdds';

function renderOdds(props: Parameters<typeof TrialOdds>[0]) {
  return render(
    <AppProviders>
      <TrialOdds {...props} />
    </AppProviders>,
  );
}

describe('TrialOdds', () => {
  it('n 번 했을 때 한 번 이상 나올 확률과 기댓값, 비용을 보여 준다', () => {
    renderOdds({ chance: 0.02, verb: '세공', costPerTrial: 1_000_000, defaultTrials: 50 });
    const panel = screen.getByRole('region', { name: '세공 횟수별 확률' });
    // 1 - 0.98^50 = 63.58%, 50 x 0.02 = 1번, 50 x 100만 = 5,000만 G
    expect(panel).toHaveTextContent('한 번 이상 나올 확률 63.58%');
    expect(panel).toHaveTextContent('평균 1번');
    expect(panel).toHaveTextContent('드는 골드 5,000만 G');
  });

  it('횟수를 바꾸면 다시 센다', () => {
    renderOdds({ chance: 0.5, verb: '복원' });
    fireEvent.change(screen.getByLabelText('복원 횟수'), { target: { value: '2' } });
    expect(screen.getByRole('region', { name: '복원 횟수별 확률' })).toHaveTextContent(
      '한 번 이상 나올 확률 75%',
    );
  });

  it('50%, 90%, 99% 로 보려면 몇 번 해야 하는지 적는다', () => {
    renderOdds({ chance: 0.5, verb: '세공', costPerTrial: 100 });
    const panel = screen.getByRole('region', { name: '세공 횟수별 확률' });
    expect(panel).toHaveTextContent('50% 확률로 보려면 1번 (100 G)');
    expect(panel).toHaveTextContent('90% 확률로 보려면 4번 (400 G)');
    expect(panel).toHaveTextContent('99% 확률로 보려면 7번 (700 G)');
  });

  it('비용을 모르면 골드는 적지 않고, 나올 수 없으면 그리지 않는다', () => {
    const { unmount } = renderOdds({ chance: 0.1, verb: '세공' });
    expect(screen.getByRole('region', { name: '세공 횟수별 확률' })).not.toHaveTextContent('골드');
    unmount();
    renderOdds({ chance: 0, verb: '세공' });
    expect(screen.queryByRole('region', { name: '세공 횟수별 확률' })).not.toBeInTheDocument();
  });
});
