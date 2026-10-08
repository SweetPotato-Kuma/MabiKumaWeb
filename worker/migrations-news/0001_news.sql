-- 공식 홈페이지 새소식(공지사항, 개발자 노트)과 진행 중인 이벤트의 기록.
--
-- 공식 홈페이지는 글을 고칠 때 고친 글을 새로 올리지 않고 올린 글을 그대로 바꾼다. 무엇이 바뀌었는지는
-- 앞 본문을 갖고 있어야만 알 수 있다. 그래서 본문이 바뀔 때마다 판(revision)을 하나씩 더 남긴다(news.js).
-- 시세 기록(MARKET)과 다른 데이터베이스다. 본문 HTML 이 쌓여 커지므로 시세 기록의 용량을 나눠 쓰지 않게 했다.
--
--   npx wrangler d1 migrations apply mabikuma-news --remote

-- 글 하나. id 는 공식 홈페이지의 글 번호다(notice_view.asp?id=).
--   board       notice(공지사항) | update(개발자 노트)
--   category    공지, 점검, 이벤트, 샵, 개발자 노트
--   posted_at   글에 적힌 올린 시각(초). 한국 시각을 유닉스 시각으로 바꾼 것
--   first_seen  처음 받은 시각
--   checked_at  마지막으로 본문을 다시 읽은 시각
--   edited_at   본문이 바뀐 것을 마지막으로 본 시각. 한 번도 안 바뀌었으면 NULL
--   revisions   판 수. 1 이면 처음 받은 그대로다
--   body_hash   마지막 판의 제목과 본문 해시
--   pinned      목록 맨 위 고정 글인가. 고정 글은 오래 두고 고치므로 기간이 지나도 다시 읽는다
--   deleted_at  공식 홈페이지에서 "게시물을 찾을 수 없습니다" 가 나온 시각
CREATE TABLE news_posts (
  id INTEGER PRIMARY KEY,
  board TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  posted_at INTEGER NOT NULL,
  first_seen INTEGER NOT NULL,
  checked_at INTEGER NOT NULL,
  edited_at INTEGER,
  revisions INTEGER NOT NULL DEFAULT 1,
  body_hash TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER
);
CREATE INDEX news_posts_posted ON news_posts (posted_at DESC, id DESC);
CREATE INDEX news_posts_category ON news_posts (category, posted_at DESC, id DESC);
CREATE INDEX news_posts_checked ON news_posts (checked_at);

-- 판. rev 1 이 처음 받은 본문이다. body 는 공식 홈페이지 본문 칸의 HTML 을 그대로 둔다.
CREATE TABLE news_revisions (
  post_id INTEGER NOT NULL,
  rev INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  hash TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, rev)
);

-- 이벤트 목록의 한 칸. 목록에서 빠지면 끝난 이벤트다(last_seen 이 마지막 수집보다 앞선다).
--   link       이벤트 글이나 이벤트 페이지 주소
--   post_id    이벤트 글이면 그 글 번호(news_posts.id 와 같다)
--   period     목록에 적힌 기간 글 그대로("상시진행" 포함)
--   starts_at, ends_at  기간을 시각(초)으로 바꾼 것. 상시진행이면 NULL
CREATE TABLE news_events (
  link TEXT PRIMARY KEY,
  post_id INTEGER,
  title TEXT NOT NULL,
  summary TEXT,
  thumb TEXT,
  period TEXT,
  starts_at INTEGER,
  ends_at INTEGER,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX news_events_last_seen ON news_events (last_seen);

-- 수집 상태. collected_at(마지막 수집), events_at(마지막 이벤트 목록), backfill:<board>(지난 글 채우기의 다음 쪽 또는 done)
CREATE TABLE news_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
