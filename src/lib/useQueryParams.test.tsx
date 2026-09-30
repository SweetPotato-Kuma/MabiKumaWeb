import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { readOneOf, useQueryParams, useQueryTextParam } from './useQueryParams';

function setup(initial: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => {
      const [params, update] = useQueryParams();
      return { params, update, search: useLocation().search };
    },
    { wrapper },
  );
}

describe('useQueryParams', () => {
  it('주소의 값을 읽는다', () => {
    const { result } = setup('/x?server=류트');

    expect(result.current.params.get('server')).toBe('류트');
  });

  it('값을 쓰고, 비었거나 null 이면 주소에서 뺀다', () => {
    const { result } = setup('/x?server=류트&pass=a');

    act(() => result.current.update({ server: '하프', pass: null }));
    expect(result.current.search).toBe('?server=%ED%95%98%ED%94%84');

    act(() => result.current.update({ server: '' }));
    expect(result.current.search).toBe('');
  });

  it('한 번의 조작에서 두 번 불러도 앞의 것을 덮어쓰지 않는다', () => {
    const { result } = setup('/x');

    act(() => {
      result.current.update({ a: '1' });
      result.current.update({ b: '2' });
    });

    expect(result.current.search).toBe('?a=1&b=2');
  });
});

describe('useQueryTextParam', () => {
  function setupText(initial: string) {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>
    );
    return renderHook(
      () => {
        const [draft, setDraft] = useQueryTextParam('q');
        return { draft, setDraft, search: useLocation().search };
      },
      { wrapper },
    );
  }

  it('주소의 값으로 입력칸을 채운다', () => {
    const { result } = setupText('/x?q=블래스트');

    expect(result.current.draft).toBe('블래스트');
  });

  it('입력칸은 바로 바뀌고 주소는 타자를 멈춘 뒤에 따라간다', () => {
    vi.useFakeTimers();
    try {
      const { result } = setupText('/x');

      act(() => result.current.setDraft('오버'));
      expect(result.current.draft).toBe('오버');
      expect(result.current.search).toBe('');

      act(() => vi.advanceTimersByTime(500));
      expect(result.current.search).toBe('?q=%EC%98%A4%EB%B2%84');
    } finally {
      vi.useRealTimers();
    }
  });

  it('공백만 남기면 주소에서 뺀다', () => {
    vi.useFakeTimers();
    try {
      const { result } = setupText('/x?q=abc');

      act(() => result.current.setDraft('  '));
      act(() => vi.advanceTimersByTime(500));

      expect(result.current.search).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('readOneOf', () => {
  it('허용한 값이면 그대로, 아니면 기본값이다', () => {
    expect(readOneOf('a', ['a', 'b'], 'b')).toBe('a');
    expect(readOneOf('z', ['a', 'b'], 'b')).toBe('b');
    expect(readOneOf(null, ['a', 'b'], 'b')).toBe('b');
  });
});
