import { describe, expect, it } from 'vitest';
import {
  INDEXNOW_KEY,
  MAX_URLS_PER_REQUEST,
  changedPaths,
  fingerprint,
  submissions,
} from './indexnow.mjs';

describe('IndexNow 로 알릴 주소', () => {
  it('새 쪽, 바뀐 쪽, 없어진 쪽만 고른다', () => {
    const previous = { '/a': '1', '/b': '2', '/gone': '3' };
    const next = { '/a': '1', '/b': 'changed', '/new': '4' };
    expect(changedPaths(previous, next).sort()).toEqual(['/b', '/gone', '/new']);
  });

  it('옛 목록이 없으면 전부 알린다', () => {
    expect(changedPaths({}, { '/a': '1', '/b': '2' })).toEqual(['/a', '/b']);
  });

  it('지문은 제목, 설명, 본문이 같으면 같고 하나라도 다르면 다르다', () => {
    expect(fingerprint('제목', '설명', '본문')).toBe(fingerprint('제목', '설명', '본문'));
    expect(fingerprint('제목', '설명', '본문')).not.toBe(fingerprint('제목', '설명', '본문2'));
    // 칸 경계가 섞여 같은 지문이 되면 안 된다.
    expect(fingerprint('ab', 'c')).not.toBe(fingerprint('a', 'bc'));
  });

  it('상한을 넘으면 나눠 보내고 키 파일 위치를 함께 적는다', () => {
    const urls = Array.from({ length: MAX_URLS_PER_REQUEST + 1 }, (_, i) => `https://mabi.spkuma.com/item/${i}`);
    const batches = submissions('https://mabi.spkuma.com', urls);
    expect(batches.map((batch) => batch.urlList.length)).toEqual([MAX_URLS_PER_REQUEST, 1]);
    expect(batches[0]).toMatchObject({
      host: 'mabi.spkuma.com',
      key: INDEXNOW_KEY,
      keyLocation: `https://mabi.spkuma.com/${INDEXNOW_KEY}.txt`,
    });
  });
});
