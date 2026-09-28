-- 거대한 외침의 뿔피리 기록.
--
-- 뿔피리 내역 API 는 서버마다 최근 1,000건까지만 준다. 붐비는 류트는 30분이면 1,000건이 찬다.
-- 워커가 5분마다(그리고 누가 찾을 때 1분마다) 받아 여기에 쌓고, 화면은 여기서 찾는다(horn.js).
--
--   npx wrangler d1 migrations apply mabikuma-market --remote

-- 글 한 줄. 같은 캐릭터가 같은 글을 GAP(30분) 안에 다시 외치면 새 줄을 만들지 않고 times 를 올린다.
-- 파티 광고는 10초 남짓마다 저절로 다시 외쳐져 받은 글의 9할이 반복이다.
--   body     "이름 : " 앞머리와 파티 광고의 "#[채널N]", "[3/4명]" 을 뗀 본문
--   norm     찾기용. 이름과 본문을 이어 붙여 공백을 빼고 소문자로 바꾼 것
--   kind     party(파티 광고), buy(삽니다), sell(팝니다), chat(그 밖)
--   members  파티 광고의 가장 최근 인원 "3/4"
CREATE TABLE horn_posts (
  id INTEGER PRIMARY KEY,
  server TEXT NOT NULL,
  character TEXT NOT NULL,
  body TEXT NOT NULL,
  norm TEXT NOT NULL,
  kind TEXT NOT NULL,
  channel INTEGER,
  members TEXT,
  times INTEGER NOT NULL,
  first_ts INTEGER NOT NULL,
  last_ts INTEGER NOT NULL
);
CREATE INDEX horn_posts_server_last ON horn_posts (server, last_ts);
CREATE INDEX horn_posts_character ON horn_posts (server, character, last_ts);
