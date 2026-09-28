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
    expect(panel).toHaveTextContent('5,000만 G');
  });

  it('시행 횟수를 바꾸면 다시 센다', () => {
    renderOdds({ chance: 0.5, verb: '복원' });
    fireEvent.change(screen.getByLabelText('시행 횟수'), { target: { value: '2' } });
    expect(screen.getByRole('region', { name: '복원 횟수별 확률' })).toHaveTextContent(
      '한 번 이상 나올 확률 75%',
    );
  });

  it('횟수를 넘겨받으면 입력 칸 없이 그 횟수로 센다', () => {
    renderOdds({ chance: 0.5, verb: '복원', trials: 3 });
    expect(screen.queryByLabelText('시행 횟수')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '복원 횟수별 확률' })).toHaveTextContent(
      '한 번 이상 나올 확률 87.5%',
    );
  });

  it('목표 확률별 횟수 같은 자세한 줄은 두지 않는다', () => {
    renderOdds({ chance: 0.5, verb: '세공', costPerTrial: 100 });
    const panel = screen.getByRole('region', { name: '세공 횟수별 확률' });
    expect(panel).not.toHaveTextContent('90%');
    expect(panel).not.toHaveTextContent('99%');
  });

  it('비용을 모르면 골드는 적지 않고, 나올 수 없으면 그리지 않는다', () => {
    const { unmount } = renderOdds({ chance: 0.1, verb: '세공' });
    expect(screen.getByRole('region', { name: '세공 횟수별 확률' })).not.toHaveTextContent(' G');
    unmount();
    renderOdds({ chance: 0, verb: '세공' });
    expect(screen.queryByRole('region', { name: '세공 횟수별 확률' })).not.toBeInTheDocument();
  });
});
