-- 경매장 거래 기록.
--
-- 경매장 거래 내역 API 는 최근 1시간만 돌려준다. 워커가 10분마다 받아 여기에 쌓고, 화면은
-- 여기서 아이템별 최근 1일 통계와 날짜별 그래프를 읽는다.
--
--   npx wrangler d1 migrations apply mabikuma-market --remote

-- 거래 한 건. id 는 경매장이 붙인 거래 번호라 같은 거래를 두 번 받아도 한 줄이다.
-- 옵션은 [종류, 세부, 값, 값2, 설명] 배열을 이어 붙인 JSON 이고, 없으면 NULL 이다.
-- 원본은 RAW_DAYS(90일)만 두고 지운다. 오래된 날짜는 daily 에 남는다.
CREATE TABLE trades (
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  name TEXT NOT NULL,
  display TEXT,
  category TEXT NOT NULL,
  count INTEGER NOT NULL,
  price INTEGER NOT NULL,
  options TEXT
);
CREATE INDEX trades_name_ts ON trades (name, ts);
CREATE INDEX trades_ts ON trades (ts);

-- 아이템 하루치 요약. 날짜는 한국 시각 기준 일련번호(1970-01-01 이 0)다.
-- 새 거래가 들어올 때마다 그날 몫을 원본에서 다시 계산해 덮어쓴다. 지우지 않는다.
CREATE TABLE daily (
  name TEXT NOT NULL,
  day INTEGER NOT NULL,
  category TEXT NOT NULL,
  n INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  total INTEGER NOT NULL,
  lo INTEGER NOT NULL,
  hi INTEGER NOT NULL,
  mid INTEGER NOT NULL,
  PRIMARY KEY (name, day)
) WITHOUT ROWID;

-- 수집 상태. 마지막으로 받은 거래 시각, 처음 받기 시작한 날 같은 것.
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;
