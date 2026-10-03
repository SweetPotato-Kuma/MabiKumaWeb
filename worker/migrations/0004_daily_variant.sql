-- 이름 하나에 여러 물건이 묶이는 아이템의 하루치 요약.
--
--   npx wrangler d1 migrations apply mabikuma-market --remote
--
-- 인챈트 스크롤, 도면, 옷본은 원래 이름("전용 인챈트 스크롤")이 같고 보이는 이름("전용 인챈트 스크롤 - 투지")
-- 에서만 무엇인지 갈린다. daily 는 원래 이름으로 묶어 시세 조회에 쓰므로 그대로 두고, 인기 거래 순위가
-- 보이는 이름으로 세도록 그 몫만 따로 둔다. 보이는 이름이 "원래 이름 - " 으로 시작하는 거래만 든다.
-- daily 와 같은 때 같은 원본에서 다시 계산해 덮어쓴다. 지우지 않는다.
CREATE TABLE daily_variant (
  display TEXT NOT NULL,
  day INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  n INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  total INTEGER NOT NULL,
  PRIMARY KEY (display, day)
) WITHOUT ROWID;
CREATE INDEX daily_variant_day ON daily_variant (day);

-- 남아 있는 원본(RAW_DAYS)으로 지난날 몫을 채운다. 날짜는 한국 시각 기준 일련번호다.
INSERT INTO daily_variant (display, day, name, category, n, qty, total)
SELECT display, (ts + 32400) / 86400, MAX(name), MAX(category), COUNT(*), SUM(count), SUM(count * price)
FROM trades
WHERE display IS NOT NULL AND substr(display, 1, length(name) + 3) = name || ' - '
GROUP BY display, (ts + 32400) / 86400;
