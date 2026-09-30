-- 거래 내역 목록(/market/history)을 카테고리로 훑을 때 쓸 색인.
--
--   npx wrangler d1 migrations apply mabikuma-market --remote

CREATE INDEX trades_category_ts ON trades (category, ts);
