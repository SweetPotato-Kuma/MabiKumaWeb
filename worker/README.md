# API 키 프록시 (Cloudflare Worker)

## 왜 필요한가

GitHub Pages 는 정적 파일만 서빙합니다. 브라우저가 넥슨 API 를 직접 호출하려면
키가 자바스크립트 번들 안에 있어야 하고, 그러면 개발자도구 → Network 에서
요청 헤더를 열어보는 것만으로 키가 새어 나갑니다. base64 인코딩이나 문자열
분할 같은 난독화는 보안이 아니라 지연일 뿐입니다.

키를 감추는 유일한 방법은 **키를 브라우저에 보내지 않는 것**입니다.
이 워커가 키를 들고 있고, 브라우저는 키 없이 워커를 부릅니다.

```
브라우저 ──(키 없음)──▶ Worker ──(x-nxopen-api-key)──▶ open.api.nexon.com
```

## 설정 (도메인 불필요, 무료 플랜으로 충분)

`*.workers.dev` 주소가 무료로 나오므로 도메인을 사지 않아도 됩니다.

### 대시보드로 하기

1. [dash.cloudflare.com](https://dash.cloudflare.com) 가입 후 로그인
2. **Workers & Pages → Create → Worker** — 이름은 `mabikuma-api`
3. **Deploy** 를 눌러 기본 워커를 만든 뒤 **Edit code**
4. 편집기 내용을 지우고 이 폴더의 `worker.js` 를 통째로 붙여넣고 **Deploy**
5. **Settings → Variables and Secrets**
   - **Secret** 추가: 이름 `NEXON_API_KEY`, 값은 넥슨 오픈 API 키
   - **Variable** 추가: 이름 `ALLOWED_ORIGINS`,
     값 `https://mabi.spkuma.com,http://localhost:5173`
6. 워커 주소(`https://mabikuma-api.<계정>.workers.dev`)를 복사

### CLI 로 하기

```bash
cd worker
npx wrangler login
npx wrangler secret put NEXON_API_KEY   # 프롬프트에 키 입력
npx wrangler deploy
```

### 워커를 spkuma.com 아래에 두기 (선택)

`spkuma.com` 존이 Cloudflare 에 들어와 있으면 워커에 자기 주소를 붙일 수 있습니다.

1. Workers & Pages → `mabikuma-api` → **Settings → Domains & Routes → Add → Custom domain**
2. `mabi-api.spkuma.com` 입력. DNS 레코드와 인증서는 Cloudflare 가 알아서 만듭니다.
   한 단계짜리 서브도메인이어야 합니다 — 무료 플랜의 Universal SSL 은 `*.spkuma.com` 까지만
   덮으므로 `api.mabi.spkuma.com` 같은 3단계 주소는 인증서가 따로 필요합니다(유료 ACM).
3. `VITE_PROXY_URL` 을 새 주소로 바꿉니다

`*.workers.dev` 주소를 그대로 써도 동작은 같습니다. 다만 광고 차단기 중 일부가
`workers.dev` 를 통째로 막기 때문에, 도메인이 있다면 이쪽이 덜 깨집니다.

## 이슈 제보 (POST /report/issue)

사이트 오른쪽 아래의 제보 버튼이 이 경로로 글을 보내고, 워커가 GitHub 에 이슈를 만듭니다.
방문자 대부분은 GitHub 계정이 없으므로 대신 올려 주는 구조입니다.

1. GitHub → Settings → Developer settings → **Fine-grained personal access token**
   - Repository access: 이 저장소 하나만
   - Permissions: **Issues → Read and write** 만. 다른 권한은 주지 않습니다
2. 워커에 시크릿으로 넣습니다: 이름 `GITHUB_TOKEN`
3. Variable `GITHUB_REPO` 를 `소유자/레포` 형식으로 둡니다 (`wrangler.toml` 에 이미 있습니다)

라벨은 분류에 따라 `버그` 또는 `기능 추가 요청` 이 붙습니다. 저장소에 없는 라벨이면 GitHub 이
처음 제보 때 만들어 줍니다.

### 남용을 막는 장치

토큰이 하나라 모든 제보가 같은 계정 이름으로 올라갑니다. 누가 썼는지 구분할 수 없으므로
다음으로 막습니다.

- 제목 4자에서 120자, 내용 10자에서 4000자
- 사람이 채울 일 없는 칸(`website`)에 값이 있으면 거절
- `ISSUE_RATE_LIMIT` 바인딩이 있으면 IP 당 1분에 3건까지 (`wrangler.toml` 참고)
- `ALLOWED_ORIGINS` 가 브라우저 밖 호출을 걸러 냅니다

대시보드로 워커를 만들었다면 rate limiting 바인딩이 없을 수 있습니다. 그때는 Security →
WAF → Rate limiting rules 에서 `/report/issue` 경로에 규칙을 하나 걸어 두세요.

## 아이템 카드와 아이콘 서버 (/item-card)

넥슨 API 는 아이템 설명도 아이콘도 주지 않습니다. 그래서 두 경로로 채웁니다.

- **대부분**은 운영자가 자기 컴퓨터에서 한꺼번에 올립니다(15,000장 남짓).
  그때 쓰는 것이 아래 `POST /item-card/icons` 와 `PUT /item-card/shard` 입니다.
- **거기서 빠진 것**은 사이트의 `/item-card` 화면에서 툴팁 스크린샷을 읽어 한 장씩 넣습니다.

설명은 KV 에 카테고리별로, 아이콘 PNG 는 R2 에 한 장씩 들어갑니다.

```
일괄 등록 ────(운영자 키)──▶ Worker ──▶ KV(설명) + R2(아이콘)
운영자 브라우저 ──(운영자 키)──▶ Worker ──▶ KV + R2
방문자 브라우저 ──(키 없음)────▶ Worker ──▶ KV + R2   (읽기 전용)
```

### 왜 KV 와 R2 를 나눴나

| | 설명(카드 목록) | 아이콘 |
| --- | --- | --- |
| 개수 | 카테고리 79칸 | 15,000장 남짓 |
| 크기 | 가장 큰 칸이 536KB | 장당 평균 1.5KB, 합계 약 22MB |
| 저장소 | KV | R2 |

KV 무료 플랜은 **하루 쓰기 1,000건**입니다. 아이콘을 KV 에 넣으면 한 번 채우는 데만 보름이
걸립니다. R2 는 월 100만 쓰기에 하루 제한이 없어 작은 파일을 많이 두기에 맞습니다.
반대로 카드 목록은 79번만 쓰면 되니 KV 로 충분합니다.

카드 목록을 한 덩어리로 두지 않는 이유는 CPU 입니다. 사전을 다 채우면 JSON 이 2.9MB 가
되는데 무료 플랜 워커는 요청당 CPU 10ms 라 매 조회마다 그걸 파싱할 수 없습니다.
카테고리로 쪼개면 가장 큰 칸(천옷)이 536KB, 푸는 데 0.8ms 라 여유 있게 들어갑니다.

### 무엇이 잠기고 무엇이 안 잠기는가

- **잠깁니다**: 쓰기. `ADMIN_KEY` 를 모르면 카드를 넣거나 지울 수 없습니다.
- **잠깁니다**: 전체 목록. 목록을 통째로 주는 경로가 아예 없습니다. 아이콘 파일 이름이
  내용 해시(64비트)라 찍어서 맞힐 수 없으므로, **목록이 곧 모든 아이콘 주소의 색인**입니다.
  공개하면 스크립트 한 번으로 전부 내려받힙니다.
- **안 잠깁니다**: 한 장씩 보기. 방문자는 `POST /item-card/lookup` 으로 화면에 지금 보이는
  이름(합쳐서 최대 60개, 카테고리 4개까지)만 물어봅니다. 사전을 정상적으로 넘겨 보는 데는 충분하고, 전체를 훑으려면
  수백 번 나눠 불러야 합니다.
- **안 잠깁니다**: 화면 코드. 정적 번들이라 누구나 읽을 수 있습니다. `/item-card` 의 키
  입력칸은 낯선 사람이 주소를 찾았을 때 쓸 것이 없게 만드는 정도의 장치입니다.

**완전한 차단은 아닙니다.** 아이템 이름 사전은 저장소에 공개로 들어 있으므로, 마음먹으면
그 이름들을 60개씩 끊어 `lookup` 을 반복해 결국 전부 모을 수 있습니다. 여기서 하는 일은
"한 번에 통째로"를 없애고 그 일을 느리고 눈에 띄게 만드는 것입니다.

횟수 제한을 **이미지가 아니라 조회에** 건 것도 같은 이유입니다. 사전 한 쪽을 그리면 아이콘이
50장 한꺼번에 나가므로 이미지에 제한을 걸면 정상 사용이 먼저 깨집니다. 조회는 쪽을 넘길 때
한 번만 나가니, 여기에 걸어야 사람은 멀쩡하고 긁는 쪽만 느려집니다.

### 설정

**1. KV 네임스페이스와 R2 버킷 만들기**

```bash
cd worker
npx wrangler kv namespace create ITEM_CARDS
npx wrangler r2 bucket create mabikuma-icons
```

KV 쪽에서 찍혀 나오는 `id` 를 `wrangler.toml` 의 `[[kv_namespaces]]` 항목에 넣습니다.
R2 버킷 이름은 `wrangler.toml` 의 `[[r2_buckets]]` 에 이미 적혀 있습니다.

대시보드로 한다면 **Storage & Databases → KV → Create** 와 **R2 → Create bucket** 으로
만들고, 워커의 **Settings → Bindings → Add** 에서 각각 `ITEM_CARDS`, `ICONS` 라는 이름으로
묶습니다.

> R2 는 무료 한도(10GB, 월 100만 쓰기) 안에서 써도 계정에 결제 수단 등록을 요구합니다.
> 한도를 넘지 않으면 청구되지 않습니다.

**2. 운영자 키 만들어 넣기**

길고 아무 뜻 없는 문자열이어야 합니다. 짐작할 수 있는 값을 쓰지 마세요.

```bash
node -e "console.log(crypto.randomUUID() + crypto.randomUUID())"
npx wrangler secret put ADMIN_KEY     # 위에서 나온 값을 붙여넣기
npx wrangler deploy
```

> **PowerShell 에서 `"값" | npx wrangler secret put ADMIN_KEY` 처럼 파이프로 넣지 마세요.**
> 끝에 줄바꿈이 같이 들어가서 키가 영영 안 맞습니다(`CARD_UNAUTHORIZED`). 프롬프트가 뜨면
> 직접 붙여넣거나, 대시보드의 Variables and Secrets 에서 넣으세요.

**3. 사이트에서 열기**

배포된 주소의 `/item-card` 로 들어가 그 키를 넣습니다. 키는 그 브라우저의
localStorage 에만 남고, 저장할 때마다 워커가 다시 확인합니다. 키를 넣어 둔
브라우저에서만 상단 메뉴에 `카드 만들기` 가 보입니다.

### 경로

| 경로 | 권한 | 하는 일 |
| --- | --- | --- |
| `POST /item-card/lookup` | 공개 | 보낸 이름들의 카드만. 합쳐서 60개, 카테고리 4개까지 |
| `GET /item-card/icons/<해시>.png` | 공개 | 아이콘 이미지. 평소에는 `icons.spkuma.com` 이 대신 내고, 이 경로는 예비다 |
| `POST /item-card/verify` | 운영자 | 키가 맞는지만 확인 |
| `POST /item-card` | 운영자 | 카드 한 장 저장 또는 덮어쓰기 |
| `DELETE /item-card?name=<이름>&category=<칸>` | 운영자 | 카드 삭제 |
| `POST /item-card/icons` | 운영자 | 아이콘 한 번에 40장까지 (일괄 등록용) |
| `PUT /item-card/shard` | 운영자 | 카테고리 한 칸을 통째로 갈아 끼움 (일괄 등록용) |

일괄 등록용 두 경로를 갈라 둔 이유는 **subrequest 한도**입니다. 무료 플랜 워커는 요청 하나에
R2/KV 호출을 50번까지만 할 수 있고 바인딩 호출도 거기 포함됩니다. 아이콘 저장과 칸 쓰기를
한 요청에 섞으면 한 번에 넣을 수 있는 양이 확 줄어듭니다.

`lookup` 은 한 칸짜리 `{ category, names }` 와 여러 칸짜리 `{ groups: [{ category, names }] }` 를
둘 다 받습니다. 사전은 한 카테고리만 보여 주지만, 경매장은 키워드로 찾으면 카테고리가 섞여서
카테고리마다 따로 부르면 한 번 검색에 요청이 너댓 번 나갑니다. 이름 수 상한은 칸 수와 상관없이
합쳐서 60개 그대로라, 긁어 가기 어렵게 해 둔 수준은 달라지지 않습니다.

운영자 경로는 `x-mabikuma-admin-key` 헤더에 키를 실어 보냅니다.
`lookup` 은 `CARD_RATE_LIMIT` 바인딩이 있으면 IP 당 1분에 30회까지 받습니다
(`wrangler.toml` 참고). 대시보드로 워커를 만들어 바인딩이 없다면 Security → WAF →
Rate limiting rules 에서 `/item-card/lookup` 경로에 규칙을 하나 걸어 두세요.

아이콘 파일 이름은 **그림 내용의 SHA-256 앞 16자리**입니다. 아이템 이름으로 짓지 않는
이유는 캐시 때문입니다. 같은 아이템의 아이콘을 다시 저장했을 때 이름이 그대로면 영구 캐시를
걸어 둔 브라우저가 옛 그림을 계속 보여 줍니다. 내용이 바뀌면 이름도 바뀌므로
`immutable` 캐시를 마음 놓고 걸 수 있고, 같은 그림을 두 번 저장해도 파일이 늘지 않습니다.

아이콘 요청은 출처 검사보다 **앞에서** 처리합니다. `<img src>` 요청에는 `Origin` 헤더가
없어서, 그냥 두면 `ALLOWED_ORIGINS` 검사에 걸려 사전 화면의 아이콘이 전부 403 으로 깨집니다.

### 호출을 줄이는 장치

무료 플랜 워커는 **하루 10만 요청**이 한도이고, 넘으면 요금 대신 그날 남은 시간 동안 요청이
전부 실패합니다. 이 워커가 경매장 검색 중계도 같이 하므로, 카드 때문에 한도를 넘기면 검색까지
멈춥니다. 그래서 아래 네 가지로 워커와 KV 를 덜 부릅니다.

| 장치 | 무엇을 줄이나 |
| --- | --- |
| 아이콘은 R2 자체 도메인 `icons.spkuma.com` 에서 바로 | 그림 한 장이 워커 요청 한 번이던 것이 0 이 된다. 1년짜리 `immutable` 캐시라 두 번째부터는 CDN 이 받아 R2 까지도 안 간다 |
| 브라우저에 카드를 남겨 둔다 (localStorage) | 다시 온 사람은 본 적 있는 아이템을 묻지 않는다. 카드는 사흘, "없더라" 는 반나절 믿는다 |
| 워커 인스턴스가 푼 칸을 1분 들고 있는다 | 인기 카테고리를 조회할 때 KV 읽기와 JSON 푸는 CPU 가 빠진다. 응답 머리 `x-card-shards` 로 확인할 수 있다 |
| 그림은 화면에 보일 때만 받는다 (`loading="lazy"`) | 500 줄짜리 표에서도 첫 화면 20장 남짓만 받는다 |

2026-09 실측으로 방문자 한 명이 경매장 검색 세 번을 하면 워커 요청이 60~591번에서 **14번**으로
줄었습니다. 하루 한도로 치면 받을 수 있는 방문자가 169~1,666명에서 7,100명쯤이 됩니다.
다시 온 사람은 경매장 중계 3번 정도만 남습니다.

그림 주소는 `wrangler.toml` 의 `ICON_BASE_URL` 에서 정합니다. 워커가 조회 결과에 주소를 붙여
주므로, 도메인을 바꿔도 사이트는 다시 배포하지 않아도 됩니다. 비우면 워커 경로로 돌아갑니다.
자체 도메인은 R2 버킷의 **Settings → Custom Domains** 에 연결되어 있습니다.

**R2 자체 도메인은 그대로 두면 엣지에 캐시되지 않습니다.** 2026-09-26 에 재 보니 그림과 그림 목록이
모두 `cf-cache-status: DYNAMIC` 이라 매번 R2 까지 가서 한 장에 0.45~0.85초가 걸렸습니다.
그래서 `spkuma.com` 존에 캐시 규칙을 하나 두었습니다(Caching → Cache Rules).

| 항목 | 값 |
| --- | --- |
| 조건 | `http.host eq "icons.spkuma.com"` |
| 캐시 | Eligible for cache |
| Edge TTL, Browser TTL | 원본의 Cache-Control 을 따름(그림 1년 `immutable`, 그림 목록 1시간) |

적용 뒤에는 `HIT` 가 나오고, 한 번 받은 그림은 가까운 엣지에서 바로 나갑니다. 확인은
`curl -s -o /dev/null -D - https://icons.spkuma.com/<파일>.png | grep cf-cache-status` 로 합니다
(`curl -I` 같은 HEAD 요청은 캐시되지 않아 늘 DYNAMIC 이 나옵니다).

### 관리

```bash
cd worker

# 어떤 칸이 들어 있는지. cards:xxxxxxxx 하나가 카테고리 하나다
npx wrangler kv key list --binding=ITEM_CARDS --remote

# 칸 하나 내려받기 (백업)
npx wrangler kv key get --binding=ITEM_CARDS cards:0c548921 --remote > shard-backup.json

# 백업에서 되돌리기
npx wrangler kv key put --binding=ITEM_CARDS cards:0c548921 --path shard-backup.json --remote

# 아이콘이 몇 장이나 들어 있나
npx wrangler r2 object list mabikuma-icons --remote
```

카드를 통째로 다시 채우는 가장 쉬운 방법은 백업이 아니라 **일괄 등록을 다시 돌리는
것**입니다. 언제든 같은 내용을 다시 넣을 수 있습니다.

카드 한 장을 지울 때는 KV 를 직접 건드리지 말고 API 를 쓰세요. 어느 칸에 있는지 같이
알려 줘야 합니다.

```bash
curl -X DELETE "https://<워커주소>/item-card?name=<이름>&category=<카테고리>" \
  -H "x-mabikuma-admin-key: <키>" -H "Origin: https://mabi.spkuma.com"
```

`Origin` 헤더를 같이 보내야 합니다. `ALLOWED_ORIGINS` 검사가 브라우저 밖 호출을 막습니다.

### 알아 둘 것

- **KV 는 최종 일관성입니다.** 저장 직후 다른 지역에서는 최대 60초 동안 옛 값이 보일 수
  있습니다. 혼자 쓰는 도구라 문제가 되지 않지만, 저장하고 바로 새로고침했는데 안 보이면
  잠깐 기다려 보세요.
- **KV 쓰기 한도.** 무료 플랜은 하루 1,000건입니다. 일괄 등록은 카테고리당 1건씩
  79건만 쓰므로 여유가 많습니다. 아이콘을 KV 에 두지 않는 이유가 이것입니다.
- **용량.** R2 무료 10GB 에 아이콘이 약 22MB 입니다. KV 는 값 하나가 25MB 까지인데
  가장 큰 칸이 536KB 입니다. 양쪽 다 한참 남습니다.
- **읽기 횟수.** 무료 플랜 KV 는 하루 10만 회 읽기입니다. 사전 한 쪽을 그릴 때 KV 를 한 번
  읽습니다. 아이콘에는 1년짜리 `immutable` 캐시가 걸려 있어 R2 읽기는 엣지 캐시가
  대부분 흡수합니다.
- **지워진 아이콘은 남습니다.** 카드를 지워도 R2 의 그림 파일은 놔둡니다. 이름이 내용
  해시라 다른 아이템이 같은 그림을 쓰고 있을 수 있고, 그걸 확인하려면 칸을 전부 읽어야
  합니다. 1.5KB 를 남기는 값이 더 쌉니다.

## 장비 정보 (/item-equip)

장비 시뮬레이터가 읽는 기본 능력치, 랜덤 능력치, 개조, 세공, 특별 개조입니다. 카드와 같은 KV
(`ITEM_CARDS`), 같은 운영자 키, 같은 조회 제한(`CARD_RATE_LIMIT`)을 씁니다. 새로 붙일 바인딩은 없습니다.

| 경로 | 누가 | 하는 일 |
| --- | --- | --- |
| `GET /item-equip?category=&name=` | 공개 | 장비 하나와, 그 장비에 붙는 개조, 세공, 인챈트 정의만 |
| `PUT /item-equip/shard` | 운영자 | 카테고리 한 칸을 통째로 갈아 끼움 |

- KV 키는 `equip:<카테고리 해시 8자리>` 입니다. 카드 칸(`cards:`)과 섞이지 않습니다.
- 칸 안에는 개조와 세공 정의가 카테고리 전체 몫으로 한 번씩만 들어 있습니다. 여러 장비가 같은 개조를
  쓰기 때문입니다. 조회할 때 그 장비에 붙는 것만 골라 내보내므로 한 번에 칸을 통째로 가져갈 수 없습니다.
- 인챈트는 붙일 수 있는 목록이 아이템마다 수백 개라, 같은 목록을 쓰는 아이템끼리 묶음 번호 하나로
  가리킵니다(`enchantGroups`). 조회할 때 워커가 그 묶음을 풀어 싣습니다.
- 가장 큰 칸(천옷, 약 2천 개)이 490KB 남짓입니다. 전부 올려도 KV 쓰기는 카테고리 수만큼(30여 건)입니다.

## 경매장 시세 기록 (/market)

거래 내역 API 는 최근 1시간만 돌려줍니다. 그래서 워커가 10분마다(크론) 받아 D1(`MARKET`,
`mabikuma-market`)에 쌓고, 화면은 여기서 아이템별 최근 1일 통계와 날짜별 그래프를 읽습니다.
코드는 `market.js`, 표는 `migrations/0001_market.sql` 입니다. 크론과 D1 을 쓰므로 유료 플랜이 필요합니다.

| 경로 | 누가 | 하는 일 |
| --- | --- | --- |
| `GET /market/item?name=&days=30` | 공개 | 아이템 하나의 최근 1일 통계와 날짜별 요약 |
| `POST /market/recent` `{ names }` | 공개 | 이름 여럿(60개까지)의 최근 1일 통계 |
| `POST /market/collect` | 운영자 | 크론을 기다리지 않고 지금 한 번 받기 |

- 거래 원본(`trades`)은 90일만 두고 10분마다 조금씩 지웁니다. 하루 요약(`daily`)은 지우지 않습니다.
- 날짜는 한국 시각으로 가릅니다. 중위는 거래 건수 기준, 평균은 수량 가중입니다.
- 조회는 엣지 캐시에 5분 남기고, `MARKET_RATE_LIMIT` 로 IP 당 분당 60번까지 받습니다.
- 표를 바꾸면 `migrations/` 에 새 파일을 더하고 배포 전에 적용합니다.

```bash
npx wrangler d1 migrations apply mabikuma-market --remote
# 쌓인 양 보기
npx wrangler d1 execute mabikuma-market --remote --command "SELECT COUNT(*) FROM trades"
```

## 앱에 연결

워커 주소를 `VITE_PROXY_URL` 로 넘깁니다.

- 로컬: `.env` 에 `VITE_PROXY_URL=https://mabikuma-api.<계정>.workers.dev`
- 배포: GitHub 레포 → **Settings → Secrets and variables → Actions → Variables**
  에 `VITE_PROXY_URL` 추가. 이 값은 비밀이 아니라 공개 URL 이므로 Secret 이 아니라
  Variable 로 넣습니다.

연결되면 방문자는 키 없이 바로 조회할 수 있습니다. 자기 키를 쓰고 싶은 사람은
설정 화면에 키를 넣으면 프록시를 건너뛰고 넥슨 API 를 직접 호출합니다.

## 남용 대비

- `ALLOWED_ORIGINS` 를 반드시 채우세요. 비워두면 누구나 자기 사이트에서 이 워커를
  호출해 님의 키 한도를 씁니다.
- 경로 허용 목록이 코드에 박혀 있어 열린 프록시로는 쓰이지 않습니다.
- 같은 질의는 `CACHE_SECONDS` 동안 엣지에서 캐시되어 넥슨 호출량이 줄어듭니다.
- 더 강하게 막으려면 Cloudflare 대시보드의 **Security → WAF → Rate limiting rules**
  로 IP 당 호출량 제한을 겁니다 (무료 플랜에 규칙 1개 포함).
- `ALLOWED_ORIGINS` 는 브라우저의 Origin 헤더에 기대므로 만능은 아닙니다.
  curl 로는 Origin 을 위조할 수 있습니다. 한도가 실제로 털리면 넥슨에서 키를
  재발급하고 rate limiting 규칙을 추가하세요.
