-- 공식 미리보기. 키트(샵)와 이벤트 글의 "신규 아이템 미리보기" 갤러리에서 뽑은 아이템 이름 -> 그림이나 영상.
--
-- 글 안의 갤러리는 이름 목록(ul.img_g_list)과 칸(div.img_g.g_N)이 번호로 짝을 이룬다. 새소식 기록에 받아 둔 본문에서
-- 그 짝을 뽑아 여기에 둔다(previews.js). 아이템 정보 화면이 이름으로 찾아 의장 아이템의 공식 모습을 보여 준다.
--
--   npx wrangler d1 migrations apply mabikuma-news --remote

-- 아이템 하나. 같은 이름이 여러 글에 나오면 가장 최근 글의 것만 둔다.
--   key        찾는 열쇠. 이름에서 앞의 "[트렌드]" 같은 말머리를 떼고 공백을 하나로 줄인 것
--   name       글에 적힌 이름 그대로
--   kind       image | video
--   src        공식 주소(그림은 ssl.nexon.com, 영상은 vod CDN)
--   mirror     그림 사본이 있는 R2 열쇠(previews/...). 영상은 크기가 커서(전체 10GB 안팎) 사본을 두지 않는다
--   attempts   사본 만들기에 실패한 횟수. 3번 실패하면 그만둔다
--   post_id    이 이름이 나온 글(news_posts.id), title 은 그 글 제목, posted_at 은 올린 시각(초)
CREATE TABLE item_previews (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  src TEXT NOT NULL,
  mirror TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  post_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  posted_at INTEGER NOT NULL
);
CREATE INDEX item_previews_mirror ON item_previews (kind, mirror, attempts, posted_at DESC);
CREATE INDEX item_previews_post ON item_previews (post_id);
