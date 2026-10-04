import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { ItemCardPage } from '@/pages/ItemCardPage';
import { setAdminKey } from '@/lib/adminKey';

/**
 * jsdom 에는 `LanguageModel` 이 없다. 크롬이 아닌 브라우저에서 여는 것과 같은 상황이라,
 * 작업 화면 테스트는 모델을 못 쓰는 쪽을 본다. 그쪽이 더 중요하다. 모델이 없다고 화면이
 * 죽으면 손으로 채워 넣을 길까지 같이 막힌다.
 */
function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/item-card']}>
          <ItemCardPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

/** 작업 화면은 모델 확인이 비동기라 결과가 앉을 때까지 기다린다. */
function renderEditor() {
  setAdminKey('열쇠');
  renderPage();
  return screen.findByText('이 브라우저에는 없음');
}

beforeEach(() => {
  setAdminKey('');
});

afterEach(() => {
  setAdminKey('');
});

describe('아이템 카드 화면의 잠금', () => {
  it('키가 없으면 작업 화면 대신 잠금 화면을 보여 준다', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: '운영자 화면' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '아이템 카드 만들기' })).not.toBeInTheDocument();
  });

  it('워커 주소가 없으면 키를 묻는 대신 무엇을 설정해야 하는지 말해 준다', async () => {
    // 테스트 환경에는 VITE_PROXY_URL 이 없다. 배포 전 상태와 같다.
    renderPage();

    expect(await screen.findByText('카드 저장소가 설정되지 않았습니다')).toBeInTheDocument();
    expect(screen.queryByLabelText('운영자 키')).not.toBeInTheDocument();
  });

  it('키가 있으면 작업 화면이 열린다', async () => {
    await renderEditor();

    expect(screen.getByRole('heading', { name: '아이템 카드 만들기' })).toBeInTheDocument();
  });
});

describe('아이템 카드 작업 화면', () => {
  it('스크린샷이 없으면 어떻게 넣는지 알려 준다', async () => {
    await renderEditor();

    expect(screen.getByText(/끌어다 놓거나 눌러서 고르세요/)).toBeInTheDocument();
    expect(screen.getByText(/Ctrl\+V/)).toBeInTheDocument();
  });

  it('내장 모델이 없으면 왜 안 되는지 말해 준다', async () => {
    await renderEditor();

    expect(screen.getByText('이 브라우저에는 내장 모델이 없습니다')).toBeInTheDocument();
  });

  it('모델을 못 쓰더라도 손으로 채워 저장할 수 있게 입력칸은 열어 둔다', async () => {
    await renderEditor();

    expect(screen.getByLabelText('아이템 이름')).toBeEnabled();
    expect(screen.getByLabelText('아이템 설명')).toBeEnabled();
    expect(screen.getByRole('button', { name: /사전에 저장/ })).toBeEnabled();
  });

  it('읽기 버튼은 읽을 툴팁이 없으면 눌리지 않는다', async () => {
    await renderEditor();

    expect(screen.getByRole('button', { name: /툴팁 읽기/ })).toBeDisabled();
  });
});
