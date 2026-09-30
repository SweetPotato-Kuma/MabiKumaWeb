import {
  COLOR_CHANNEL_KEYS,
  COLOR_CHANNEL_MAX,
  colorChannelBounds,
  DEFAULT_COLOR_PERCENT,
  emptyColorChannel,
  emptyColorChannels,
  type ColorChannel,
  type ColorChannels,
} from '@/features/colorChannels';
import { SERVER_NAMES } from '@/features/servers/constants';
import { readOneOf } from '@/lib/useQueryParams';
import { BAG_NAMES } from './constants';
import { buildBagTree, type BagTreeNode } from './groups';

/**
 * 튼튼한 주머니 찾기의 검색 조건을 주소 쿼리스트링으로 옮기고 되돌린다.
 *
 * 서버는 `server`, 고른 주머니는 `bag` 여러 개다. 파트 A, B, C 의 채널별 색 조건은 `a`, `b`, `c` 다.
 * 채널마다 `r100-200`(범위, 한쪽만 적어도 된다) 이나 `g120p10`(120 에서 10% 이내) 을 쉼표로 이어
 * 쓴다. 조건을 걸지 않은 것은 주소에서 뺀다.
 */

export interface BagSearchConditions {
  server: string;
  /** 트리에서 체크한 칸들. 비어 있으면 모든 주머니. */
  bags: string[];
  /** 파트 A, B, C 의 채널 조건. 채널을 하나도 걸지 않은 파트는 어떤 색이든 찾는다. */
  parts: ColorChannels[];
}

/** 처음에는 아무 조건도 걸지 않는다. 사용자가 채우기 전에 값이 들어 있으면 안 된다. */
export const emptyParts = (): ColorChannels[] => [
  emptyColorChannels(),
  emptyColorChannels(),
  emptyColorChannels(),
];

const DEFAULT_SERVER = SERVER_NAMES[0];
const PART_KEYS = ['a', 'b', 'c'] as const;

/** 주머니 하나의 이름이 이 길이를 넘을 수는 없다. 낯선 값이 끝없이 길어지지 않게 자른다. */
const MAX_BAG_KEY = 40;
/** 한 번에 고를 수 있는 칸 수의 상한. 알려진 주머니가 40여 종이다. */
const MAX_BAGS = 80;

/** 알려진 묶음 칸. 이 밖의 묶음 이름은 트리에 없는 칸이라 버린다. */
function groupKeys(nodes: readonly BagTreeNode[]): string[] {
  return nodes.flatMap((node) => (node.children ? [node.value, ...groupKeys(node.children)] : []));
}

const KNOWN_GROUPS = new Set(groupKeys(buildBagTree([...BAG_NAMES])));

/** 채널 하나를 주소 글자로. 걸지 않았으면 빈 글자. */
function channelToken(key: string, channel: ColorChannel): string {
  if (colorChannelBounds(channel) === null) return '';
  if (channel.similar) return `${key}${channel.base}p${channel.percent}`;
  return `${key}${channel.min ?? ''}-${channel.max ?? ''}`;
}

/** 파트의 채널 조건을 주소 글자로. 건 채널이 없으면 null 이라 주소에서 빠진다. */
function channelsToParam(channels: ColorChannels): string | null {
  const tokens = COLOR_CHANNEL_KEYS.map((key) => channelToken(key, channels[key])).filter(Boolean);
  return tokens.length > 0 ? tokens.join(',') : null;
}

const CHANNEL_TOKEN = /^([rgb])(?:(\d{1,3})?-(\d{1,3})?|(\d{1,3})p(\d{1,3}))$/;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** 주소 글자에서 채널 조건을. 알아볼 수 없는 조각은 그 조각만 버린다. */
function channelsFromParam(value: string | null): ColorChannels {
  const channels = emptyColorChannels();
  if (!value) return channels;
  for (const token of value.split(',').slice(0, 3)) {
    const match = CHANNEL_TOKEN.exec(token);
    if (!match) continue;
    const key = match[1] as 'r' | 'g' | 'b';
    if (match[4] !== undefined) {
      channels[key] = {
        ...emptyColorChannel(),
        similar: true,
        base: clamp(Number(match[4]), 0, COLOR_CHANNEL_MAX),
        percent: clamp(Number(match[5] ?? DEFAULT_COLOR_PERCENT), 0, 100),
      };
      continue;
    }
    const min = match[2] === undefined ? null : clamp(Number(match[2]), 0, COLOR_CHANNEL_MAX);
    const max = match[3] === undefined ? null : clamp(Number(match[3]), 0, COLOR_CHANNEL_MAX);
    channels[key] =
      min !== null && max !== null && min > max
        ? { ...emptyColorChannel(), min: max, max: min }
        : { ...emptyColorChannel(), min, max };
  }
  return channels;
}

/** 주소의 검색 조건. 낯선 값은 기본값으로 돌린다. */
export function readBagConditions(params: URLSearchParams): BagSearchConditions {
  const server = readOneOf<string>(params.get('server'), SERVER_NAMES, DEFAULT_SERVER);

  // 새로 나온 주머니는 알려진 목록에 없을 수 있어 이름은 그대로 받고, 묶음 칸만 아는 것으로 거른다.
  const bags = [...new Set(params.getAll('bag'))]
    .filter((key) => key.length > 0 && key.length <= MAX_BAG_KEY)
    .filter((key) => !key.startsWith('group:') || KNOWN_GROUPS.has(key))
    .slice(0, MAX_BAGS);

  const parts = PART_KEYS.map((key) => channelsFromParam(params.get(key)));

  return { server, bags, parts };
}

/** 검색 조건을 주소에 쓸 값으로. 기본값과 같으면 null 이라 주소에서 빠진다. */
export function bagConditionParams(
  conditions: BagSearchConditions,
): Record<string, string | string[] | null> {
  const parts = Object.fromEntries(
    PART_KEYS.map((key, part) => [key, channelsToParam(conditions.parts[part] ?? emptyColorChannels())]),
  );

  return {
    server: conditions.server === DEFAULT_SERVER ? null : conditions.server,
    bag: conditions.bags,
    ...parts,
  };
}

/** 주소에 검색 조건이 하나라도 실려 있는지. 나눠 받은 링크로 들어왔는지 가르는 데 쓴다. */
export function hasBagConditions(params: URLSearchParams): boolean {
  return ['server', 'bag', ...PART_KEYS].some((key) => params.has(key));
}
