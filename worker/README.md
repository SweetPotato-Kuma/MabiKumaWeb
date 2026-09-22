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
