import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isChunkLoadError, reloadForNewVersion } from './staleChunk';

describe('isChunkLoadError', () => {
  it('브라우저별 문구를 모두 알아본다', () => {
    expect(
      isChunkLoadError(
        new TypeError('Failed to fetch dynamically imported module: https://x/assets/A-1.js'),
      ),
    ).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
  });

  it('다른 오류는 알아보지 않는다', () => {
    expect(isChunkLoadError(new Error('Network request failed'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe('reloadForNewVersion', () => {
  const reload = vi.fn();

  beforeEach(() => {
    window.sessionStorage.clear();
    reload.mockClear();
    vi.stubGlobal('location', { ...window.location, reload });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('처음에는 새로고침하고, 바로 다시 실패하면 되풀이하지 않는다', () => {
    expect(reloadForNewVersion()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    expect(reloadForNewVersion()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('저장소를 쓸 수 없으면 새로고침하지 않는다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(reloadForNewVersion()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
