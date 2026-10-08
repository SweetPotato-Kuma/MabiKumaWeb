-- 키트(확률형 상품) 확률표 기록.
--
-- 공식 확률 정보 화면은 지금 파는 키트만 보여 주고, 판매가 끝나면 목록에서 지운다. 지난 확률표는 다시 볼 수 없으므로
-- 워커가 보이는 동안 받아 쌓는다(kits.js). 한 번 담은 키트는 지우지 않는다. 이 기능 전에 모아 둔 지난 키트는
-- 운영자가 한 번 올린다(POST /kits/import).
--
--   npx wrangler d1 migrations apply mabikuma-news --remote

-- 키트 하나. id 는 공식 확률표의 번호면 official-<번호>, 그 전에 모은 것은 archive-<시작일>-<해시>.
--   start, end   판매 시작일과 끝나는 날(YYYY-MM-DD). 판매 공지에서 읽는다. 모르면 NULL
--   price        한 번 여는 값(캐시). 모르면 NULL
--   first_seen   처음 받은 날(YYYY-MM-DD). 시작일을 모를 때 대신 줄 세운다
--   grades       [{ name, chance }] JSON
--   items        [{ name, chance, grade?, colors?, count? }] JSON. 아이템 확률은 키트 전체에 대한 확률이다
--   item_count   구성품 수. 목록에서 items 를 풀지 않고 보여 준다
--   updated_at   확률표가 마지막으로 바뀐 시각(초)
CREATE TABLE kits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start TEXT,
  "end" TEXT,
  price INTEGER,
  first_seen TEXT,
  grades TEXT NOT NULL,
  items TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX kits_order ON kits (COALESCE(start, first_seen) DESC);

-- 키트 이름과 보상 이름 -> 그림 파일 이름(R2). 게임 클라이언트가 있어야 만들 수 있어 운영자 PC 가 통째로 올린다
-- (scripts/build-kits.mjs --icons-only, POST /kits/icons).
CREATE TABLE kit_icons (
  name TEXT PRIMARY KEY,
  file TEXT NOT NULL
);
