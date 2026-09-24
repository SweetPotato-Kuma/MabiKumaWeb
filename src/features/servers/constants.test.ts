import { describe, expect, it } from 'vitest';
import { CHANNEL_COUNT_BY_SERVER, SERVER_NAMES, channelsOf } from './constants';

describe('channelsOf', () => {
  it('류트만 채널이 많고 나머지는 적다', () => {
    expect(channelsOf('류트')).toHaveLength(44);
    expect(channelsOf('만돌린')).toHaveLength(16);
    expect(channelsOf('하프')).toHaveLength(25);
    expect(channelsOf('울프')).toHaveLength(16);
  });

  it('1번부터 빈 번호 없이 이어진다', () => {
    for (const server of SERVER_NAMES) {
      const channels = channelsOf(server);
      expect(channels[0]).toBe(1);
      expect(channels.at(-1)).toBe(CHANNEL_COUNT_BY_SERVER[server]);
      expect(channels.every((channel, index) => channel === index + 1)).toBe(true);
    }
  });

  it('모르는 서버는 채널이 없다', () => {
    expect(channelsOf('없는 서버')).toEqual([]);
  });
});
