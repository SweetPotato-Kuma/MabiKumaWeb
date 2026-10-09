# 게임 데이터 갱신 안내

게임이 업데이트되면 아래 한 줄로 사이트의 게임 데이터(아이템 그림과 설명, 장비 정보, 제작법 등)를 모두 새로 만들고 올립니다.

```
node scripts/game-data/sync-all.mjs
```

더블클릭으로 쓰려면 `scripts/local/게임-데이터-갱신.bat` 를 엽니다. 이 파일은 이 PC 에만 있습니다.

남겨 둔 추출 도구의 역할, 정확한 출력 경로와 2026-10-09 정리·복구 기록은
[로컬 게임 데이터 도구 관리](game-data-tools.md)에 있습니다.

수집·추출·변환·업로드 스크립트와 보조 파일(`scripts/game-data/`, `scripts/build-*.mjs`, 수집 전용
`scripts/lib` 모듈 등), R2 게시 전용 워커(`worker/game-data-worker*`, `worker/wrangler.game-data.toml`)는
`.gitignore`로 제외합니다. 이미 추적하던 파일도 로컬 파일은 유지하고 Git 추적만 해제했습니다.
새로 복제한 저장소에는 이 도구들이 없으므로 운영자 PC의 파일을 따로 백업·복원해야 합니다.
웹 빌드용 `scripts/postbuild.mjs`, IndexNow와 해당 보조 모듈, 서비스 API 워커는 계속 저장소에서 관리합니다.

스케줄러에서는 아래처럼 `--scheduled`를 넘깁니다. 메뉴와 `pause` 없이 실행하고 실패 종료 코드를 전달합니다.
클라이언트 내보내기도 포함합니다. 마지막 내보내기만 쓰려면 뒤에 `--skip-export`를 추가합니다.

```
"C:\Claude\mabiKuma\scripts\local\게임-데이터-갱신.bat" --scheduled
```

| 메뉴 | 명령 | 언제 |
| --- | --- | --- |
| [1] 전부 | `sync-all.mjs` | 게임 업데이트 뒤. 클라이언트에서 다시 꺼내고 올리기까지 |
| [2] 내보내기 빼고 | `sync-all.mjs --skip-export` | 클라이언트는 그대로이고 사전이나 스크립트만 바뀌었을 때 |
| [3] 파일만 | `sync-all.mjs --skip-export --no-upload` | 올리지 않고 `.cache`에 만들어 비교할 때 |

생성 JSON은 `.cache/game-data/current`에 모으고 **Cloudflare R2에 게시합니다.** 바뀐 객체만 올리고 공개 목록은 마지막에
교체합니다. 데이터 갱신에는 커밋/푸시나 사이트 재배포가 필요 없습니다. 이 코드 변경은 최초 한 번 사이트에 배포해야 합니다.
게임 실행 파일, 런처, 안티치트는 실행하거나 변경하지 않습니다.

### 최초 설정

이 PC는 Cloudflare에 로그인된 Wrangler와 `.env`의 기존 `MABIKUMA_ADMIN_KEY`를 사용합니다. 운영자 키는 명령 인수나 로그에
넣지 않고 stdin으로 전달합니다. 경매장/새소식 워커와 분리된 `mabikuma-game-data` 워커가 같은 `mabikuma-icons` 버킷의
`game-data/` 영역에만 씁니다.

```
node scripts/game-data/sync-all.mjs --setup-storage --setup-only
```

`MABIKUMA_WRANGLER`에 설치된 `wrangler/bin/wrangler.js` 경로가 필요합니다(프로젝트에 설치했다면 생략).
워커 주소 `MABIKUMA_GAME_DATA_UPLOAD_URL`은 Git에서 제외한 `.env.local`에 자동 기록됩니다.
화면은 `VITE_GAME_DATA_BASE_URL`을 읽고, 생략하면 기존 `VITE_ICON_BASE_URL`을 씁니다.
개발 서버에서는 같은 `/data/` 주소로 `.cache/game-data/current`만 읽습니다.
운영 화면에서는 Cloudflare의 공개 목록과 객체를 읽습니다. 목록·파일 조회나 JSON 해석에 실패하면
`/data-error`로 이동합니다. 오래된 배포본 JSON으로 대체하지 않으며, 다시 조회하면 원래 주소와 검색 조건으로 돌아갑니다.

## 미리 있어야 하는 것

| 무엇 | 어디 | 비고 |
| --- | --- | --- |
| 게임 클라이언트 | `.cache/client-src/Mabinogi` | 설치된 마비노기 폴더 |
| 내보내기 스크립트 | `.cache/client-src/offline-audit/Run-ClientExport.ps1` | 저장소 밖. 다른 곳이면 `MABIKUMA_CLIENT_EXPORT` 에 경로 |
| Python 3.10 | `%LOCALAPPDATA%\Programs\Python\Python310` 또는 PATH | 내보내기가 쓴다 |
| Node.js | PATH | |
| `.env` 의 `VITE_PROXY_URL`, `MABIKUMA_ADMIN_KEY` | 저장소 뿌리 | 올리기에만 필요. 파일만 만들 때는 없어도 된다 |

내보내기는 게임 실행 파일, 런처, 보안 프로그램을 띄우지 않고 설치 폴더의 데이터 파일만 읽습니다.

내보내기는 이전 결과와 비교해 같은 원본 데이터 파일과 이미지 변환 결과를 재사용합니다.
SHA-256도 파일의 번호, 크기, 수정 시각과 파일 시스템 변경 시각이 모두 같으면 이전 검증값을 사용합니다.
Windows에서는 NTFS/ReFS의 ChangeTime을 함께 확인하므로 크기가 같거나 수정 시각이 유지된 패치도 다시 읽습니다.
이 정보를 확인할 수 없는 파일 시스템에서는 항상 전체 바이트를 읽습니다.
캐시는 `.cache/client-src/exports/client-bundle/_work/file-hashes.sqlite`에 남으며,
처음 실행하거나 캐시가 없는 파일은 한 번 전체 검증합니다. 수집 코드가 바뀌면 해당 결과도 다시 만듭니다.

전체 해시를 다시 검사하려면 동일 BAT에 `--scheduled --verify-export`를 넘깁니다.
이는 기존 결과 검증을 강제로 다시 읽는 옵션이며, 게임 실행이나 클라이언트 다운로드는 하지 않습니다.
각 단계 소요 시간과 실제로 읽은 파일/바이트 수, 해시 재사용 수를 실행 로그에 출력합니다.
2026-10-09에 같은 클라이언트로 재실행한 전체 내보내기는 약 1분 43초였습니다.
같은 날 도구 정리 후 전체 검증은 15분 28초가 걸렸으며 기존 결과와 같음을 확인했습니다.
변경 없는 실행도 이미지·데이터베이스 검증과 시스템 부하에 따라 시간이 달라집니다.
첫 캐시 준비나 실제 패치 때는 다시 처리할 단계가 있으며, 공식 자료 조회와 업로드 시간은 별도입니다.

## 하는 일과 걸리는 시간

| 순서 | 단계 | 무엇을 | 대략 |
| --- | --- | --- | --- |
| 1 | 클라이언트 내보내기 | 바뀐 패키지만 다시 풀고, 그림은 바뀐 것만 다시 그린다 | 변경 없는 재실행 측정 1분 43초~15분 28초. 최초·패치 추출은 약 30분 이상 가능 |
| 2 | 로컬 JSON 생성 | 제작법, 아르카나, 세트 효과, 인챈트 스크롤, 상세 검색 이름, 세공 도구 확률표, 에코스톤, 공식 특별 개조 표 | 5분 |
| 3 | 아이템 카드 | 제작법 재료 그림 → 경매장 사전의 카드(그림, 설명) | 수 분~수십 분, 캐시와 변경량에 따라 |
| 4 | 장비 정보 | 개조, 세공, 인챈트, 에르그, 기본·랜덤 능력치 | 1분 |
| 5 | 스킬, 오검 그림 | | 몇 초 |
| 6 | JSON 게시 | 내용 해시 객체 → 공개 목록 교체 → 게시 확인 | 최초 수 분, 다음에는 변경량에 따라 |

올리는 단계는 지난번과 같은 칸, 같은 그림을 건너뜁니다. 바뀐 것이 없으면 아무것도 보내지 않습니다.
한 실행은 같은 클라이언트 내보내기를 계속 사용합니다. 스케줄러와 수동 실행이 겹치면 두 번째 실행은 실패 코드로 종료됩니다.

## 파일이 나오는 곳

**현재 생성 결과 (커밋하지 않음)**

`C:\Claude\mabiKuma\.cache\game-data\current\`에 아래 표 이름과 같은 JSON이 생깁니다.
`echostone.json`, `special-upgrades.json`, `game-images.json`도 같은 폴더에 있습니다.
`comparison.json`과 `manifest.json`은 그 위 `.cache/game-data/`에 남깁니다.

주머니 염색 지도도 같은 폴더의 `bag-dyes.json`으로 만들고 R2에서 읽습니다. `public/bag-dyes.json`은
배포에서 제거했습니다. 통합 갱신에서 기존 캡처와 클라이언트 아이콘, 공식 API 표본을 사용하며 게임을 실행하지 않습니다.
이번 상점에 없는 종류는 유지하고, 재현 검증에 실패한 지도는 게시하지 않습니다.

경매장 이름은 공식 API의 카테고리 없는 전체 조회로 끝 페이지까지 수집합니다. 중단 지점은
`.cache/game-data/auction-names-checkpoint.json`, 완료 여부와 추가 카테고리는 `auction-names-report.json`에 남깁니다.
중간 실패는 실패 종료 코드로 전달하고 다음 실행에서 이어 읽습니다. 만료된 커서는 처음부터 다시 확인합니다.
넥슨 API 키가 없으면 `.env`의 우리 API 워커(`VITE_PROXY_URL`)를 통해 같은 공식 API를 읽습니다.
둘 다 없으면 건너뛴 사실을 `official-api-status.json`과 로그에 남깁니다.

세공 상세 표는 같은 날짜의 정정도 반영하도록 하루마다 다시 확인하며, 공식 홈페이지 요청은 1초 이상 띄웁니다.
첫 재확인은 약 3,000장의 캐시 때문에 오래 걸릴 수 있습니다. 수집 범위는 기존 도구 3종과 1랭크를 유지합니다.
공식 보조 자료만 갱신할 때는 `sync-all.mjs --official-only`, 저장된 세공 상세 응답으로 산출물을 검증할 때만
`--use-cached-official`을 추가합니다. 후자는 같은 날짜의 정정을 재확인하지 않습니다.

`public/data`의 JSON은 저장소와 배포본에서 제거했습니다. `--refresh-public-data` 옵션은 폐지했습니다.
캐시에 없는 표는 우리 Cloudflare 게시본에서만 준비하며, 갱신한 로컬 결과를 덮어쓰지 않습니다.
사이트 빌드는 같은 공개 목록의 아이템 이름과 제작법을 `.cache/game-data/build`에 해시 검증 후 받아
검색엔진용 아이템 HTML을 만듭니다. 빌드 입력 조회가 실패하면 배포를 중단합니다.
게임 클라이언트가 없는 GitHub Actions에서는 수집을 하지 않습니다.

클라이언트 패치 후 한국 기능 상태표가 비어 있으면 갱신을 중단합니다. 날짜만 새로 적힌 채 아르카나나 스킬이
누락된 자료를 게시하지 않도록 기능 판독 코드의 정적 검증과 내보내기를 먼저 갱신해야 합니다.

| 파일 | 내용 |
| --- | --- |
| `.cache/game-data/current/recipes.json` | 제작법 |
| `.cache/game-data/current/arcana.json` | 아르카나와 스킬 |
| `.cache/game-data/current/set-effects.json` | 세트 효과 |
| `.cache/game-data/current/enchant-scrolls.json` | 인챈트 스크롤 사양 |
| `.cache/game-data/current/option-names.json` | 경매장 상세 검색 자동완성 이름 |
| `.cache/game-data/current/reforge.json` | 세공 도구 확률표 |
| `.cache/game-data/current/items/*.json` | 아이템 이름 사전. 제작법에만 나오는 이름이 더해질 때 바뀐다 |
| `.cache/game-data/current/game-images.json` | 게시하는 스킬, 오검 그림 파일 이름 |

**우리 서버 (워커, KV, R2)**: 아이템 카드의 그림과 설명, 장비 정보, 스킬과 오검 그림, 제작법 등 JSON.
JSON 공개 목록은 `https://icons.spkuma.com/game-data/manifest.json`, 실제 파일은 `game-data/objects/<SHA256>.js`입니다.
확장자는 CDN 캐시용이며 내용과 Content-Type은 JSON입니다. 새로고침한 화면은 공개 목록의 같은 판을 사용합니다.
게임 그림은 저장소에 두지 않습니다.

오검 시뮬레이터의 기존 정리 표는 이번에 저장 위치만 옮겼습니다. 아직 클라이언트에서 다시 만드는 단계는 없습니다.
특별 개조는 공식 공지에서 수치를 확인한 악기/힐링 원드(S/R)와 한손 도끼/양손 무기만 보완합니다.
일부 실린더 및 기존 표의 미확인 칸은 그대로 미확인입니다. 장인 개조의 범위 및 기존 처리 방식은 유지합니다.

**이 PC 의 `.cache` (깃 밖)**

| 경로 | 내용 |
| --- | --- |
| `.cache/client-src/exports/client-bundle/runs/<시각>/` | 내보내기 결과. `latest.json` 이 마지막 실행을 가리킨다 |
| `.cache/client-src/exports/client-bundle/_work/render-cache` | 그림 캐시. 지우면 다음 내보내기가 그림을 처음부터 다시 그린다 |
| `.cache/item-cards/uploaded-shards.json`, `uploaded-files.json` | 카드 올린 기록 |
| `.cache/equipment/uploaded-shards.json`, `shards/` | 장비 올린 기록과 마지막으로 만든 칸 |
| `.cache/equipment/artisan-odds/` | 공식 홈페이지의 장인 개조 확률 페이지 |
| `.cache/reforge/` | 공식 홈페이지의 세공 도구 확률표 |
| `.cache/item-cards/hidden-items.tsv` | 게임에서 볼 수 없는 아이템 목록(`node scripts/game-data/hidden-items.mjs`) |

다시 올리고 싶으면 `node scripts/game-data/collect-item-cards.mjs --force`, `node scripts/game-data/collect-equipment.mjs --force` 를 따로 돌립니다.

## 데이터는 어디서 오는가

공식 캐시 상점의 묶음 가격·마일리지 제도에 대한 2026-10-09 조사 기록은
[공식 캐시 상점 묶음 할인과 마일리지](itemshop-pricing-mileage.md)에 있습니다.

- **게임 클라이언트**: 거의 전부. 다른 사람의 서버는 쓰지 않습니다.
- **넥슨 공식 홈페이지**: 클라이언트에 없는 것만. 장인 개조 확률(확률 공개 페이지), 세공 도구 확률표. 받은 것은
  `.cache` 에 남기고 처음 보는 것만 1초 간격으로 묻습니다.
- **넥슨 오픈 API**: 경매장 이름 사전과 주머니 염색 표본. 키 또는 우리 API 워커가 있으면 같은 `sync-all`에서 수집합니다.
  별도의 `harvest.yml` 및 사전 JSON을 자동 커밋하던 작업은 제거했습니다.

## 클라이언트만으로 정할 수 없어 적어 둔 것

| 파일 | 무엇 | 언제 고치나 |
| --- | --- | --- |
| `scripts/game-data/erg-pins.json` | 에르그 무기 묶음별 효과 문장 열쇠, 에르그가 붙는 무기 규칙 | 에르그 무기 종류가 새로 생겼을 때 |
| `scripts/game-data/item-id-pins.json` | 이름이 같은 아이템 가운데 카드에 쓸 번호 161개 | 카드가 엉뚱한 아이템을 가리킬 때 |

## 이럴 때는

- **새 아이템 그림이 곰 모양 빈 그림으로 나온다**: 그 아이템이 마지막 내보내기에 없거나 이름 사전에 없는 것입니다.
  게임 업데이트 뒤 [1] 전부를 돌립니다. 경매장에 갓 올라온 이름이면 공식 API 키를 설정하고 같은 갱신을 실행합니다.
- **장인 개조에 확률이 없다**: 공식 확률 페이지에 아직 올라오지 않은 개조입니다. 하루에 한 번 목록을 다시 보고,
  올라오면 다음 실행 때 채워집니다.
- **"클라이언트 내보내기가 없습니다"**: [1] 전부로 내보내기를 한 번 돌립니다.
- **올리기에서 "운영자 키가 없습니다"**: `.env` 에 `VITE_PROXY_URL` 과 `MABIKUMA_ADMIN_KEY` 를 넣습니다.
