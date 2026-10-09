import { describe, expect, it, vi } from 'vitest';
import { fetchGameData } from '@/lib/gameData';
import { loadDyeBook, paintBag, parseDyeBook } from './dye';

vi.mock('@/lib/gameData', () => ({ fetchGameData: vi.fn() }));

const file = {
  size: 2,
  shadeScale: 100,
  bags: {
    주머니: {
      parts: 2,
      cells: btoa(String.fromCharCode(0, 0, 0, 0, 1, 10, 20, 30, 2, 200, 50, 100, 6, 0, 30, 0)),
    },
  },
};

describe('주머니 지도', () => {
  it('곱하기와 더하기 염색을 적용하고 투명/고정색을 보존한다', () => {
    const book = parseDyeBook(file);
    expect([...paintBag(book, book.bags.get('주머니')!, ['ff8000', '202020'])!]).toEqual([
      0, 0, 0, 0, 10, 20, 30, 255, 255, 64, 0, 255, 62, 62, 62, 255,
    ]);
    expect(paintBag(book, book.bags.get('주머니')!, ['ff8000'])).toBeNull();
  });
  it('픽셀 수가 다른 지도는 사용하지 않는다', () => {
    expect(parseDyeBook({ ...file, size: 48 }).bags.size).toBe(0);
  });
  it('조회 실패 후 재시도하고 R2 게임 데이터 경로를 사용한다', async () => {
    vi.mocked(fetchGameData).mockRejectedValueOnce(new Error('일시 장애'));
    expect(await loadDyeBook()).toBeNull();
    vi.mocked(fetchGameData).mockResolvedValueOnce(new Response(JSON.stringify(file)));
    expect((await loadDyeBook())?.bags.size).toBe(1);
    expect(fetchGameData).toHaveBeenCalledWith('bag-dyes.json');
  });
});
