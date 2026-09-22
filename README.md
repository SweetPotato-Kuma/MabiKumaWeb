# MabiKumaWeb

마비노기 오픈 API 를 사용해 경매장 시세와 NPC 상점 정보를 조회하는 정적 웹 도구입니다.
React + TypeScript + Vite 로 만들고, UI 는 antd 하나로 통일했습니다. GitHub Actions 로 GitHub Pages 에 자동 배포합니다.

디자인 규칙은 [.claude/skills/mabikuma-ui/SKILL.md](.claude/skills/mabikuma-ui/SKILL.md) 에 있습니다.

- 배포 주소: https://mabi.spkuma.com/ (GitHub Pages + Cloudflare DNS)
- 데이터 출처: [NEXON Open API — 마비노기](https://openapi.nexon.com/ko/game/mabinogi/)

## 기능

| 화면 | 사용 엔드포인트 |
| --- | --- |
| 경매장 매물 검색 (카테고리 / 이름) | `GET /mabinogi/v1/auction/list` |
| 경매장 키워드 검색 | `GET /mabinogi/v1/auction/keyword-search` |
| 최근 1시간 거래 내역 | `GET /mabinogi/v1/auction/history` |
| NPC 상점 카탈로그 | `GET /mabinogi/v1/npcshop/list` |

매물 목록에서는 개당 가격의 최저 / 중위 / 평균 / 최고값을 함께 계산해 보여줍니다.
평균만 보면 터무니없는 호가에 끌려가므로 중위값을 같이 봅니다.

## 시작하기

```bash
npm install
cp .env.example .env    # 선택. 값을 비워두면 기본값으로 동작한다
npm run dev             # http://localhost:5173
```

`VITE_PROXY_URL` 이 설정돼 있으면 키 없이 바로 조회됩니다. 없으면 화면의 **설정** 메뉴에서
자기 키를 넣으면 됩니다 — 그 값은 브라우저 `localStorage` 에만 저장됩니다.

키 발급: [openapi.nexon.com](https://openapi.nexon.com/) 로그인 → `내 애플리케이션` → 앱 등록.

### npm 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 (넥슨 API 는 `/nexon-api` 프록시로 우회) |
| `npm run build` | 타입 검사 → 프로덕션 빌드 → SPA 폴백(`404.html`) 생성 |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run typecheck` | `tsc -b` 타입 검사만 |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm test` / `test:watch` | Vitest |

## 배포 (GitHub Pages)

`main` 브랜치에 푸시하면 `.github/workflows/deploy.yml` 이 lint → typecheck → test → build 를
돌린 뒤 GitHub Pages 로 배포합니다. Pull Request 에서는 `ci.yml` 이 같은 검사를 수행합니다.

### 최초 1회 설정

1. GitHub 레포지토리 → **Settings → Pages**
2. **Build and deployment → Source** 를 `GitHub Actions` 로 변경
3. **Custom domain** 에 `mabi.spkuma.com` 을 넣고 저장 (DNS 는 아래 항목 참고)
4. DNS 검사가 통과하고 인증서가 발급되면 **Enforce HTTPS** 체크
5. `main` 에 푸시하면 Actions 탭에서 배포가 진행됩니다

`gh-pages` 브랜치는 쓰지 않습니다. 빌드 산출물은 Pages 아티팩트로 바로 업로드됩니다.

### 커스텀 도메인 (mabi.spkuma.com)

도메인은 가비아에서 구입했고, DNS 는 Cloudflare 가 맡습니다.

1. **가비아** → 도메인 관리 → 네임서버 변경 → Cloudflare 가 알려준 네임서버 2개로 교체.
   가비아의 `DNS 관리` 가 아니라 **네임서버 자체를 Cloudflare 로 넘기는 것**입니다.
2. **Cloudflare** → 해당 존 → DNS → 레코드 추가

   | Type | Name | Content | Proxy |
   | --- | --- | --- | --- |
   | CNAME | `mabi` | `sweetpotato-kuma.github.io` | **DNS only (회색 구름)** |

3. GitHub → Settings → Pages → Custom domain 에 `mabi.spkuma.com` 저장.
   GitHub 이 Let's Encrypt 인증서를 발급할 때까지 기다립니다(보통 몇 분, 최대 24시간).
   이 동안 Cloudflare 프록시를 켜면 도메인 검증이 막히므로 **회색 구름을 유지**합니다.
4. 인증서가 나오고 `Enforce HTTPS` 가 켜진 뒤, 원하면 프록시(주황 구름)를 켭니다.
   이때 Cloudflare **SSL/TLS → 암호화 모드**를 반드시 **Full (strict)** 로 둡니다.
   `Flexible` 이면 GitHub 이 다시 HTTPS 로 돌려보내 리다이렉트 루프가 납니다.

`public/CNAME` 에도 같은 도메인이 들어 있어 빌드 산출물과 함께 올라갑니다.
도메인을 바꾸면 이 파일, Pages 설정, 워커의 `ALLOWED_ORIGINS` 세 곳을 같이 고칩니다.

### 경로(base) 처리

커스텀 도메인은 루트에서 동작하므로 Vite `base` 는 `/` 입니다.
워크플로가 `actions/configure-pages` 가 알려주는 값을 `VITE_BASE_PATH` 로 넘기므로,
Pages 설정을 바꾸면(커스텀 도메인을 떼는 등) 빌드 경로도 따라갑니다.
로컬 빌드 기본값은 `vite.config.ts` 의 `DEFAULT_BASE_PATH` 입니다.

SPA 라우팅은 `scripts/postbuild.mjs` 가 `index.html` 을 `404.html` 로 복사해 처리합니다.
`/auction` 같은 주소로 직접 들어와 새로고침해도 앱이 정상적으로 뜹니다.

## API 키를 어떻게 다루는가

정적 사이트에는 비밀을 둘 곳이 없습니다. 키를 번들에 넣으면 개발자도구 → Network 에서
요청 헤더를 보는 것만으로 새어 나가고, base64·문자열 분할 같은 난독화는 보안이 아니라
지연일 뿐입니다. 그래서 **키를 브라우저에 보내지 않는** 구조를 씁니다.

```
방문자 ──(키 없음)──▶ Cloudflare Worker ──(x-nxopen-api-key)──▶ open.api.nexon.com
```

- 워커 코드와 설정 방법은 [`worker/README.md`](worker/README.md) 에 있습니다.
  도메인 없이 무료 `*.workers.dev` 주소로 동작합니다.
- 워커 주소는 `VITE_PROXY_URL` 로 넘깁니다. 공개 URL 이므로 Actions 에서 Secret 이 아니라
  **Variable**(`vars.VITE_PROXY_URL`) 로 둡니다.
- 자기 키를 쓰고 싶은 사람은 **설정** 화면에 키를 넣으면 프록시를 건너뛰고 넥슨 API 를
  직접 호출합니다. 그 키는 그 사람 브라우저의 `localStorage` 에만 남습니다.
- `VITE_NEXON_API_KEY` 는 로컬 개발 편의용입니다. 배포 워크플로는 주입하지 않습니다.

참고로 넥슨 오픈 API 는 요청 origin 을 반영한 `Access-Control-Allow-Origin` 을 응답하고
`x-nxopen-api-key` preflight 도 통과시킵니다(2026-09 확인). 즉 CORS 때문에 프록시가
필요한 것이 아니라, **키를 감추기 위해** 필요한 것입니다.

## 구조

```
src/
├─ app/            라우터, react-query 클라이언트
├─ components/     레이아웃, 공통 표시 컴포넌트
├─ features/
│  ├─ auction/     경매장: types / constants / api / hooks / stats
│  └─ npcshop/     NPC 상점: types / constants / api / hooks
├─ lib/            API 클라이언트, 설정 저장소, 포매터
├─ pages/          라우트별 화면
├─ styles/         전역 스타일
└─ test/           테스트 설정

worker/            키를 들고 있는 Cloudflare Worker (배포 대상 아님)
```

- `lib/nexonClient.ts` 가 인증 헤더와 에러 변환을 한곳에서 담당합니다.
  화면 코드는 `NexonApiError` 만 보면 됩니다.
- `lib/settings.ts` 는 `useSyncExternalStore` 기반의 작은 저장소입니다.
  설정을 바꾸면 앱 전체가 즉시 반응합니다.
- 경로 별칭 `@/*` → `src/*` (`tsconfig.app.json` + `vite.config.ts` 양쪽에 설정).

## 참고

- 게임 데이터는 API 기준으로 평균 10분 지연됩니다.
- 거래 내역은 최근 1시간 분량만 제공됩니다.
- 경매장 조회는 커서 기반으로 1회 최대 500건입니다. 화면의 `더 불러오기` 로 이어집니다.
- 이 프로젝트는 개인이 만든 비공식 도구이며 넥슨과 무관합니다.
