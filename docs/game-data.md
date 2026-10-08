# 게임 데이터 갱신 안내

게임이 업데이트되면 아래 한 줄로 사이트의 게임 데이터(아이템 그림과 설명, 장비 정보, 제작법 등)를 모두 새로 만들고 올립니다.

```
node scripts/game-data/sync-all.mjs
```

더블클릭으로 쓰려면 `scripts/local/게임-데이터-갱신.bat` 를 엽니다. 이 파일은 이 PC 에만 있습니다.

| 메뉴 | 명령 | 언제 |
| --- | --- | --- |
| [1] 전부 | `sync-all.mjs` | 게임 업데이트 뒤. 클라이언트에서 다시 꺼내고 올리기까지 |
| [2] 내보내기 빼고 | `sync-all.mjs --skip-export` | 클라이언트는 그대로이고 사전이나 스크립트만 바뀌었을 때 |
| [3] 파일만 | `sync-all.mjs --skip-export --no-upload` | 올리지 않고 저장소 파일만 만들어 볼 때 |

끝나면 바뀐 저장소 파일 목록을 보여 줍니다. **커밋과 푸시는 하지 않습니다.** 목록을 보고 직접 커밋하고 푸시하면
GitHub Pages 가 사이트를 다시 배포합니다.

## 미리 있어야 하는 것

| 무엇 | 어디 | 비고 |
| --- | --- | --- |
| 게임 클라이언트 | `.cache/client-src/Mabinogi` | 설치된 마비노기 폴더 |
| 내보내기 스크립트 | `.cache/client-src/offline-audit/Run-ClientExport.ps1` | 저장소 밖. 다른 곳이면 `MABIKUMA_CLIENT_EXPORT` 에 경로 |
| Python 3.10 | `%LOCALAPPDATA%\Programs\Python\Python310` 또는 PATH | 내보내기가 쓴다 |
| Node.js | PATH | |
| `.env` 의 `VITE_PROXY_URL`, `MABIKUMA_ADMIN_KEY` | 저장소 뿌리 | 올리기에만 필요. 파일만 만들 때는 없어도 된다 |

내보내기는 게임 실행 파일, 런처, 보안 프로그램을 띄우지 않고 설치 폴더의 데이터 파일만 읽습니다.

## 하는 일과 걸리는 시간

| 순서 | 단계 | 무엇을 | 대략 |
| --- | --- | --- | --- |
| 1 | 클라이언트 내보내기 | 바뀐 패키지만 다시 풀고, 그림은 바뀐 것만 다시 그린다 | 30분 |
| 2 | 저장소 파일 | 제작법, 아르카나, 세트 효과, 인챈트 스크롤, 상세 검색 이름, 세공 도구 확률표 | 2분 |
| 3 | 아이템 카드 | 제작법 재료 그림 → 경매장 사전의 카드(그림, 설명) | 1분 |
| 4 | 장비 정보 | 개조, 세공, 인챈트, 에르그, 기본·랜덤 능력치 | 1분 |
| 5 | 스킬, 오검 그림 | | 몇 초 |

올리는 단계는 지난번과 같은 칸, 같은 그림을 건너뜁니다. 바뀐 것이 없으면 아무것도 보내지 않습니다.

## 파일이 나오는 곳

**저장소 안 (커밋 대상)**

| 파일 | 내용 |
| --- | --- |
| `public/data/recipes.json` | 제작법 |
| `public/data/arcana.json` | 아르카나와 스킬 |
| `public/data/set-effects.json` | 세트 효과 |
| `public/data/enchant-scrolls.json` | 인챈트 스크롤 사양 |
| `public/data/option-names.json` | 경매장 상세 검색 자동완성 이름 |
| `public/data/reforge.json` | 세공 도구 확률표 |
| `public/data/items/*.json` | 아이템 이름 사전. 제작법에만 나오는 이름이 더해질 때 바뀐다 |
| `src/features/itemcard/generated/gameImages.json` | 스킬, 오검 그림 파일 이름 |

**우리 서버 (워커, KV, R2)**: 아이템 카드의 그림과 설명, 장비 정보, 스킬과 오검 그림. 게임 그림은 저장소에 두지 않습니다.

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

- **게임 클라이언트**: 거의 전부. 다른 사람의 서버는 쓰지 않습니다.
- **넥슨 공식 홈페이지**: 클라이언트에 없는 것만. 장인 개조 확률(확률 공개 페이지), 세공 도구 확률표. 받은 것은
  `.cache` 에 남기고 처음 보는 것만 1초 간격으로 묻습니다.
- **넥슨 오픈 API**: 경매장 이름 사전. 이 스크립트가 아니라 `harvest.yml` 이 매주 따로 모읍니다.

## 클라이언트만으로 정할 수 없어 적어 둔 것

| 파일 | 무엇 | 언제 고치나 |
| --- | --- | --- |
| `scripts/game-data/erg-pins.json` | 에르그 무기 묶음별 효과 문장 열쇠, 에르그가 붙는 무기 규칙 | 에르그 무기 종류가 새로 생겼을 때 |
| `scripts/game-data/item-id-pins.json` | 이름이 같은 아이템 가운데 카드에 쓸 번호 161개 | 카드가 엉뚱한 아이템을 가리킬 때 |

## 이럴 때는

- **새 아이템 그림이 곰 모양 빈 그림으로 나온다**: 그 아이템이 마지막 내보내기에 없거나 이름 사전에 없는 것입니다.
  게임 업데이트 뒤 [1] 전부를 돌립니다. 경매장에 갓 올라온 이름이면 다음 사전 수집(`harvest.yml`) 뒤에 다시 돌립니다.
- **장인 개조에 확률이 없다**: 공식 확률 페이지에 아직 올라오지 않은 개조입니다. 하루에 한 번 목록을 다시 보고,
  올라오면 다음 실행 때 채워집니다.
- **"클라이언트 내보내기가 없습니다"**: [1] 전부로 내보내기를 한 번 돌립니다.
- **올리기에서 "운영자 키가 없습니다"**: `.env` 에 `VITE_PROXY_URL` 과 `MABIKUMA_ADMIN_KEY` 를 넣습니다.
