# 작업 규칙

## Git 마무리

- 작업한 변경에 맞는 검증을 수행하고 문제가 없으면 바로 commit → push한다. 추가 확인을 요청하지 않는다.
- 본인이 작업한 변경만 커밋하고, 동시에 진행 중인 다른 작업의 변경은 보존한다.
- 수집·추출·변환·업로드 전용 로컬 도구, 캐시, 게임 그림과 비밀 키는 기존 `.gitignore` 규칙을 지킨다.

## 게임 데이터

게임 데이터 작업은 [갱신 안내](docs/game-data.md)와 [로컬 도구 관리](docs/game-data-tools.md)를 따른다.

## 로그인과 개인 데이터

- 계정 설정과 저장 정책은 [계정 동기화 안내](docs/account-sync.md)를 따른다.
- Google OAuth 웹 클라이언트 ID는 `733364928830-env2pp751gvusr6e28vg1uafji6rafb6.apps.googleusercontent.com`이다.
  공개 식별자이며 `worker/wrangler.toml`의 `GOOGLE_CLIENT_ID`가 설정 원천이다. 재배포할 때 비우거나 다른 종류의 키로 바꾸지 않는다.
- 프런트는 `https://mabi.spkuma.com`, 계정 API는 `https://mabi-api.spkuma.com`이다.
  계정 API는 `VITE_ACCOUNT_API_URL`로 지정하고, 인증 쿠키가 필요한 요청은 `workers.dev`로 바꾸지 않는다.
- 계정 데이터는 비공개 D1 `mabikuma-accounts`의 `ACCOUNTS` 바인딩에 저장한다. 공개 R2 이미지 버킷에 넣지 않는다.
- 비로그인은 기존 localStorage에 저장한다. 로그인은 Google 인증 → 미등록 계정의 닉네임·동의 등록 → 개인 데이터 동기화 순서다.
  등록된 계정에 연결하면 기존 로컬 입력을 클라이언트에서 자동으로 합친다. 처음 연결할 때 같은 항목은 계정 값이 우선이다.
  마지막으로 가져온 비로그인 입력을 기록해 오래된 값이 다시 업로드되지 않게 하고, 실제 수정 충돌은 사용자에게 선택을 받는다.
  로그인 창에는 Google 공식 버튼 하나만 표시하고 파일 가져오기·내보내기와 수동 동기화 버튼을 추가하지 않는다.
  재방문 시 유효한 보안 쿠키로 로그인 상태를 자동 복원한다. 명시적으로 로그아웃한 사용자를 자동 재인증하지 않는다.
- Google 토큰은 서버에서 서명·대상·발급자·만료·일회용 nonce를 검증한다. 세션 토큰은 HttpOnly·Secure 쿠키에 보관한다.
  계정 소유 확인, 허용 Origin 검사와 저장 충돌 방지를 유지한다.
- Search Console 서비스 계정 키와 PageSpeed API 키는 로그인용 자격 증명이 아니다.
  `.cache`의 개인 키·API 키, 세션 쿠키, Google ID 토큰과 사용자 저장 내용은 채팅·로그·Git에 출력하지 않는다.
- Worker 설정 변경은 테스트 후 실제 Worker에도 배포하고 `/account/config` 상태를 확인한다. GitHub Pages push만으로 Worker는 갱신되지 않는다.
  기존 시크릿, 다른 데이터용 바인딩과 크론 설정을 보존한다.
