-- 공식 홈페이지 메인 화면의 이벤트 배너. 순서와 그림, 링크, 제목을 그대로 둔다.
--
-- 공식 메인은 1920x580 큰 그림 열 장 안팎을 페이드로 넘긴다. 이벤트 목록의 작은 그림(410x150)과 달리 이 그림이
-- 홈 화면 배너다. 새소식 크론이 10분마다 메인을 읽어 통째로 바꾼다(banners.js). 목록을 못 읽으면 앞 목록을 그대로 둔다.
--
--   npx wrangler d1 migrations apply mabikuma-news --remote

-- 배너 한 칸. pos 가 공식 메인에서 보이는 순서(0부터)다.
--   banner_id  공식 배너 번호
--   href       공식 주소(절대 주소). 새소식 글이면 notice_view, event_view 주소다
--   image      배너 그림(ssl.nexon.com)
--   kind       이벤트, 샵, 업데이트 같은 말머리. 없으면 NULL
--   title      말머리를 뗀 제목
CREATE TABLE main_banners (
  pos INTEGER PRIMARY KEY,
  banner_id TEXT NOT NULL,
  href TEXT NOT NULL,
  image TEXT NOT NULL,
  kind TEXT,
  title TEXT NOT NULL,
  seen_at INTEGER NOT NULL
);
