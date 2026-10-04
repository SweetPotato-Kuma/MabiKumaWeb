import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { IssueReportModal, IssueReportTrigger } from '@/components/IssueReportButton';

let canReport = true;
vi.mock('@/features/report/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  canReportIssue: () => canReport,
}));

function renderAll() {
  return render(
    <AppProviders>
      <MemoryRouter>
        <IssueReportTrigger variant="icon" />
        <IssueReportTrigger variant="link" />
        <IssueReportModal />
      </MemoryRouter>
    </AppProviders>,
  );
}

describe('의견 보내기', () => {
  it('헤더 아이콘을 누르면 제보 창이 열린다', async () => {
    canReport = true;
    renderAll();

    fireEvent.click(screen.getByRole('button', { name: '의견 보내기' }));

    expect(await screen.findByRole('dialog', { name: '의견 보내기' })).toBeInTheDocument();
  });

  it('푸터의 글자 링크로도 같은 창이 열린다', async () => {
    canReport = true;
    renderAll();

    fireEvent.click(screen.getByText('의견 보내기', { selector: 'a, span.ant-typography' }));

    expect(await screen.findByRole('dialog', { name: '의견 보내기' })).toBeInTheDocument();
  });

  it('제보를 받을 곳이 없으면 단추를 그리지 않는다', () => {
    canReport = false;
    renderAll();

    expect(screen.queryByRole('button', { name: '의견 보내기' })).toBeNull();
    expect(screen.queryByText('의견 보내기')).toBeNull();
  });

  it('화면 오른쪽 아래에 떠 있는 버튼은 없다', () => {
    canReport = true;
    const { container } = renderAll();

    expect(container.querySelector('.ant-float-btn')).toBeNull();
  });
});
