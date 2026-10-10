/** 사용자 입력만 동기화한다. 인증 키, API 키, 조회 캐시는 이 목록에 넣지 않는다. */
const KEYS = new Set([
  'mabikuma:homeLayout:v1',
  'mabikuma:materialMemo:v2',
  'mabikuma:savedSearches',
  'mabikuma:bagWatches',
  'mabikuma:taltinFarm',
  'mabikuma:userSettings',
  'mabikuma:themeMode',
  'mabikuma:coinFx',
  'mabikuma:echostoneFx',
  'mabikuma:holyWaterFx',
  'mabikuma:kitFx',
  'mabikuma:relicFx',
  'mabikuma:reforgeFx',
]);
export const PERSONAL_DATA_MAX_BYTES = 256 * 1024;
export function isPersonalKey(key) {
  return (
    typeof key === 'string' &&
    (KEYS.has(key) || /^mabikuma:(?:calc|dungeonCoins:inventory):[a-z0-9-]{1,80}$/.test(key))
  );
}
export function validateEntries(entries) {
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return false;
  const pairs = Object.entries(entries);
  return (
    pairs.length <= 100 &&
    pairs.every(
      ([key, value]) => isPersonalKey(key) && typeof value === 'string' && value.length <= 100000,
    ) &&
    new TextEncoder().encode(JSON.stringify(entries)).byteLength <= PERSONAL_DATA_MAX_BYTES
  );
}
