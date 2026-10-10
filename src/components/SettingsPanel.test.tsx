import { MemoryRouter, useLocation } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { SettingsButton, SettingsPanel } from '@/components/SettingsPanel';
import { getSettings, resetSettingsForTest } from '@/lib/userSettings';

beforeEach(() => {
  window.localStorage.clear();
  resetSettingsForTest();
});
afterEach(() => {
  window.localStorage.clear();
  resetSettingsForTest();
});

describe('설정 패널', () => {
  it('설정에서 홈 편집 모드로 이동한다', () => {
    function Location() {
      return <output>{useLocation().search}</output>;
    }
    render(
      <MemoryRouter initialEntries={['/auction']}>
        <AppProviders>
          <SettingsPanel />
          <Location />
        </AppProviders>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: '위젯 편집' }));
    expect(screen.getByText('?editWidgets=1')).toBeInTheDocument();
  });
  it('처음에는 류트, 숫자 표기이고 생략과 제외는 꺼져 있다', () => {
    render(
      <MemoryRouter>
        <AppProviders>
          <SettingsPanel />
        </AppProviders>
      </MemoryRouter>,
    );

    expect(screen.getByRole('radio', { name: '류트' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '숫자' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '1만 미만 생략' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: '1만 미만 생략' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: '심볼·도면·옷본 제외' })).not.toBeChecked();
    expect(screen.getByText('1,149,001,234 G')).toBeInTheDocument();
  });

  it('기본 서버를 고르면 저장된다', () => {
    render(
      <MemoryRouter>
        <AppProviders>
          <SettingsPanel />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('radio', { name: '하프' }));

    expect(getSettings().server).toBe('하프');
    expect(JSON.parse(window.localStorage.getItem('mabikuma:userSettings') ?? '{}').server).toBe(
      '하프',
    );
  });

  it('한글 표기를 고르면 예시가 바뀌고 1만 미만 생략을 쓸 수 있다', () => {
    render(
      <MemoryRouter>
        <AppProviders>
          <SettingsPanel />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('radio', { name: '한글' }));
    expect(screen.getByText('11억 4,900만 1,234 G')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '1만 미만 생략' })).toBeEnabled();

    fireEvent.click(screen.getByRole('checkbox', { name: '1만 미만 생략' }));
    expect(screen.getByText('11억 4,900만 G')).toBeInTheDocument();
  });

  it('심볼·도면·옷본 제외를 켠다', () => {
    render(
      <MemoryRouter>
        <AppProviders>
          <SettingsPanel />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: '심볼·도면·옷본 제외' }));

    expect(getSettings().hideSymbols).toBe(true);
  });
});

describe('헤더 설정 단추', () => {
  it('누르면 설정 팝오버가 열린다', async () => {
    render(
      <MemoryRouter>
        <AppProviders>
          <SettingsButton />
        </AppProviders>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    const popover = await screen.findByRole('tooltip', { name: /설정/ });

    expect(within(popover).getByRole('radio', { name: '울프' })).toBeInTheDocument();
  });
});
