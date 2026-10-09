# 로컬 게임 데이터 도구 관리

2026-10-09 기준. 평소에는 아래 BAT 하나만 실행합니다.

**`C:\Claude\mabiKuma\scripts\local\게임-데이터-갱신.bat`**

갱신 순서와 Cloudflare 설정은 [게임 데이터 갱신 안내](game-data.md)에 있습니다.
이 문서는 남겨 둔 도구의 역할, 산출물 위치, 백업과 복원 방법을 설명합니다.

## 실행 방법

| BAT 메뉴 | 하는 일 |
| --- | --- |
| 1. 전부 | 설치된 클라이언트에서 데이터·그림 추출 → 사이트용 JSON 생성 → 변경분 업로드 |
| 2. 내보내기 빼고 | 마지막 추출 결과로 사이트용 JSON 재생성 → 변경분 업로드 |
| 3. 파일만 | 마지막 추출 결과로 사이트용 JSON 생성·비교. 업로드 단계 생략 |

메뉴 3은 새 클라이언트 추출과 카드·장비·이미지 업로드 단계도 생략합니다.
새 클라이언트에서 추출하되 업로드하지 않으려면 다음 인수를 사용합니다.

```bat
"C:\Claude\mabiKuma\scripts\local\게임-데이터-갱신.bat" --scheduled --no-upload
```

예약 실행에는 `--scheduled`를 넘깁니다. 메뉴와 마지막 대기 없이 실행하며 실패 종료 코드를 전달합니다.

```bat
"C:\Claude\mabiKuma\scripts\local\게임-데이터-갱신.bat" --scheduled
```

변경 없는 클라이언트의 재추출은 캐시를 재사용합니다. 2026-10-09 측정은 약 1분 43초부터
이번 정리 뒤 전체 검증의 15분 28초까지 차이가 있었습니다.
첫 추출과 실제 패치는 더 오래 걸리며 공식 자료 조회·업로드 시간은 별도입니다.
같은 원본도 디스크·시스템 부하에 따라 실행 시간이 달라집니다.
전체 파일 해시를 다시 읽어 검증할 때만 `--verify-export`를 추가합니다.

게임 실행 파일, 런처, 게임 DLL, 안티치트를 실행하거나 변경하지 않습니다.
설치 폴더의 파일을 분석용 Python으로 읽습니다. 원천은 게임 클라이언트이며,
클라이언트에 없는 보조 자료만 넥슨 공식 홈페이지와 공식 API에서 읽습니다.

## 남겨 둔 파일

아래 표의 경로는 모두 `C:\Claude\mabiKuma\`를 기준으로 합니다.
같은 기능의 다른 실행 진입점을 만들지 않고 `sync-all.mjs` 순서에 필요한 단계를 추가합니다.

| 경로 | 역할 |
| --- | --- |
| `scripts/local/게임-데이터-갱신.bat` | 사용자가 실행하는 메뉴·예약 실행 진입점 |
| `scripts/game-data/sync-all.mjs` | 전체 작업 순서와 실패 처리 |
| `.cache/client-src/offline-audit/Run-ClientExport.ps1` | 통합 작업이 호출하는 Python 내보내기 연결부 |
| `.cache/client-src/offline-audit/run_client_export.py` | 추출·한국어 정리·이미지·번들 검증 단계 조정 |
| `.cache/client-src/offline-audit/export_hash_cache.py` | 변경된 파일만 다시 해시 검사하는 캐시 |
| `.cache/client-src/offline-audit/orpe_extract.py` | 패키지 해독·무결성·출력 경로 검증 |
| `.cache/client-src/offline-audit/extract_game_data.py` | 원본 데이터와 문자열 추출 |
| `.cache/client-src/offline-audit/resolve_game_data.py` | 한국어 문자열·참조 연결과 한국 프로필 정리 |
| `.cache/client-src/offline-audit/organize_game_data.py` | 엔티티별 데이터 정리와 미니게임 제외 |
| `.cache/client-src/offline-audit/audit_data_conditions.py` | 번역·참조의 조건 일치 검사 |
| `.cache/client-src/offline-audit/feature_semantics.py`, `feature-semantics-proof.json` | 정적 근거와 파일 해시로 한국 기능 상태 판독 |
| `.cache/client-src/offline-audit/extract_client_images.py` | 텍스처 추출과 무손실 이미지 변환 |
| `.cache/client-src/offline-audit/item_dye.py` | 아이템 레이어와 염색 색상 합성 |
| `.cache/client-src/offline-audit/build_client_bundle.py` | 데이터·이미지를 한 결과 폴더에 모으고 최종 검증 |
| `.cache/client-src/offline-audit/validate_client_bundle.py` | 저장된 완성 번들을 별도로 재검증하는 유지보수 도구 |
| `.cache/client-src/offline-audit/decode_digest.py` | 원본 패키지 목록 인증을 확인하는 회귀 검사 보조 모듈 |
| `.cache/client-src/offline-audit/test_*.py` | 현행 추출·조건·이미지·캐시 동작의 회귀 검사 |
| `.cache/client-src/offline-audit/deps/`, `vendor/`, `requirements-images.txt` | 분석용 암호화·이미지 처리 라이브러리와 패키지 판독 의존성 |
| `.cache/client-src/offline-audit/provenance.json`, `orpe-provenance.json` | 사용한 분석 코드의 출처·과거 조사 기록 |

`feature-semantics-proof.json`은 현재 판독에 필요한 근거입니다. 날짜가 붙은 옛 사본과 달리 삭제하면 안 됩니다.
라이브러리의 Python/DLL은 분석용 의존성이며 게임 클라이언트 DLL을 로드하지 않습니다.

사이트용 Node 도구도 각각 맡은 단계가 있어 유지했습니다.

| 경로·파일 묶음 | 역할 |
| --- | --- |
| `scripts/build-*.mjs`, `sync-recipe-names.mjs` | 제작법·아르카나·인챈트·세트·세공·키트·이름·염색 지도 JSON 생성 |
| `scripts/harvest-auction.mjs`, `scripts/dictionary-excluded.json` | 공식 API 이름 사전과 제외 규칙 |
| `scripts/game-data/bundle-items.mjs`, `client-tables.mjs`, `client-recipes.mjs`, `item-filter.mjs` | 마지막 클라이언트 결과, 장비·제작 표와 한국 행 필터의 공용 구현 |
| `scripts/game-data/collect-item-cards.mjs`, `collect-equipment.mjs`, `upload-game-images.mjs` | 카드·장비·이미지 생성과 변경분 업로드 |
| `scripts/game-data/card-match.mjs`, `enchant-defs.mjs`, `kit-names.mjs`, `set-effects.mjs` | 이름·번호·인챈트·키트·세트 연결 |
| `scripts/game-data/auction-harvest.mjs`, `artisan-odds.mjs`, `official-cache.mjs` | 공식 자료 수집·간격·캐시 처리 |
| `scripts/game-data/build-echostone.mjs`, `build-special-upgrades.mjs` | 에코스톤과 공식 특별 개조 보조 표 |
| `scripts/game-data/output-path.mjs`, `release.mjs`, `publish.mjs` | 출력 위치·변경 비교·검증·R2 게시 |
| `scripts/game-data/erg-pins.json`, `item-id-pins.json` | 규칙만으로 결정할 수 없는 번호·문자열 열쇠 연결 |
| `scripts/game-data/hidden-items.mjs` | 한국에서 표시하지 않는 아이템을 설명하는 진단 보고서 |
| `scripts/lib/dictionary.mjs`, `enchant-scrolls.mjs`, `kit-archive.mjs`, `recipe-names.mjs` | 위 단계가 공유하는 보조 구현 |
| `scripts/game-data/*.test.mjs`, `automation.node.mjs`, 관련 `scripts/lib/*.test.mjs` | 현재 도구의 회귀 검사 |
| `worker/game-data-worker.js`, `worker/wrangler.game-data.toml` | 우리 R2 게시 서비스의 코드와 설정 |

웹 빌드용 `postbuild.mjs`, `indexnow.mjs`와 관련 모듈, 서비스 API 워커는 별도로 유지합니다.
테스트·진단 도구는 평소 BAT를 실행할 때 직접 실행할 필요가 없습니다.

## 입력과 산출물 위치

| 절대 경로 | 내용 |
| --- | --- |
| `C:\Claude\mabiKuma\.cache\client-src\Mabinogi\` | 원본 게임 설치 폴더. 현재 연결된 설치 경로 유지 |
| `C:\Claude\mabiKuma\.cache\client-src\exports\client-bundle\latest.json` | 마지막 완료 실행의 `run` 상대 경로 |
| `C:\Claude\mabiKuma\.cache\client-src\exports\client-bundle\runs\<시각>\` | 데이터와 이미지가 함께 든 최종 추출 결과 |
| 위 실행 폴더의 `assets\items.jsonl`, `assets\skills.jsonl` | 아이템·스킬 설명과 이미지 연결 |
| 위 실행 폴더의 `images\webp\` | 합성한 정사각형 무손실 WebP |
| 위 실행 폴더의 `images\source\`, `images\layers\` | 원본 텍스처·원래 크기 변환본과 염색용 레이어 |
| `C:\Claude\mabiKuma\.cache\game-data\current\` | 사이트가 사용하는 생성 JSON |
| `C:\Claude\mabiKuma\.cache\game-data\comparison.json` | 이전 산출물과의 비교 |
| `C:\Claude\mabiKuma\.cache\game-data\manifest.json` | 생성 파일과 내용 해시 목록 |

`latest.json`의 `run`을 `client-bundle` 경로 뒤에 붙이면 실제 최신 결과 폴더가 됩니다.
그림 파일 이름과 개수는 클라이언트 버전에 따라 달라집니다.
완성 번들의 WebP는 원래 픽셀을 확대하지 않고 긴 변 길이의 정사각형 중앙에 둡니다.

빠른 다음 실행을 위해 다음 폴더는 유지합니다.

- `C:\Claude\mabiKuma\.cache\client-src\exports\client-bundle\_work\`: 해시·렌더 캐시와 중간 결과 위치 기록.
- `C:\Claude\mabiKuma\.cache\client-src\exports\game-data*\`: 마지막 원본·한국어·정리 단계 결과.
- `C:\Claude\mabiKuma\.cache\item-cards\`, `equipment\`, `reforge\`: 참조 그림, 공식 응답, 업로드 이력.
- `C:\Claude\mabiKuma\.cache\client-src\offline-audit\results\`: 이전 정적 분석 근거·수동 검토 자료.

이번 정리는 스크립트와 오래된 안내문 정리입니다. 추출 데이터·그림·원본·캐시는 삭제하지 않았습니다.
캐시를 모두 지우면 재추출·재조회가 오래 걸리며, 참조 그림을 지우면 기본 색 선택에도 영향을 줄 수 있습니다.

## 제거한 도구와 복구

2026-10-09에 불필요한 파일 30개(스크립트 22개)를 작업 폴더에서 제거했습니다.
통합 전 변환·포장·실행 도구, 외부 이미지 비교 실험, 구형 헤더 분석과 조건 탐색,
중간 결과 전용 검증 명령, 폐기된 안내문과 오래된 배포 ZIP이 대상입니다.
현행 코드의 import 관계와 별도 단계 호출을 추적해 통합 실행에 필요한 파일은 제외했습니다.

복구용 보관 위치:

```text
C:\Claude\mabiKuma\.cache\backups\extraction-cleanup-20261009\obsolete-tools.zip
C:\Claude\mabiKuma\.cache\backups\extraction-cleanup-20261009\cleanup-manifest.json
C:\Claude\mabiKuma\.cache\backups\extraction-cleanup-20261009\정리-기록.md
```

ZIP에 담은 각 파일의 SHA-256과 CRC를 원본과 비교했습니다.
JSON 목록은 제거 이유·원래 경로·크기·해시를, 정리 기록은 제거 파일 이름을 담고 있습니다.
교체 전 README 두 개도 ZIP에 보관했습니다.
과거 출처 파일에 적힌 구형 보고서·스냅샷은 당시 기록이며 현재 사용 안내는 이 문서입니다.

복원할 때는 ZIP을 **새 임시 폴더에 풀고**, 필요한 파일만 목록의 원래 경로로 복사합니다.
ZIP 전체를 프로젝트 위에 덮어 풀면 폐기한 실행 도구와 옛 문서가 다시 섞입니다.
구형 도구는 조사 기록을 복원하기 위한 것이며 현재 갱신에는 쓰지 않습니다.

## PC를 옮길 때와 유지보수 검사

수집 도구는 Git에서 제외되어 있습니다. 저장소를 새로 복제하는 것만으로는 복원되지 않습니다.
위의 현행 도구 파일, Python 의존성, 한국 기능 판독 근거와 예외 연결 파일을 함께 백업합니다.
원본 클라이언트 경로도 준비하고, 운영 키가 있는 `.env` 계열 파일은 별도로 안전하게 옮깁니다.
제거 도구 ZIP은 현행 도구 전체의 백업이 아닙니다.

추출 코드를 수정한 뒤에는 아래로 남긴 Python 회귀 검사를 실행할 수 있습니다.

```powershell
Set-Location 'C:\Claude\mabiKuma\.cache\client-src\offline-audit'
& "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe" -m unittest discover -s . -p 'test_*.py' -v
```

한국 기능 상태 검증이 실패하면 새 기능을 임의로 제외하지 않습니다.
원본 패치의 구조·정적 근거와 판독 코드를 검토한 뒤 같은 통합 진입점으로 갱신합니다.

이번 정리 뒤 Python 회귀 검사 81개와 자동 갱신 검사 8개가 통과했습니다.
Node 파일 49개의 문법과 로컬 import, 통합 단계 14개의 파일 존재도 확인했습니다.
남겨 둔 추출 도구·설정 27개는 정리 전과 SHA-256이 같습니다.
검사 기록은 `C:\Claude\mabiKuma\.cache\deploy-review\extraction-cleanup-20261009\verification.json`에 있습니다.
실제 `Run-ClientExport.ps1`도 종료 코드 0으로 완료했습니다. 원본·한국어·정리·최종 번들이 모두
`unchanged-verified`였으며 기존 최신 결과를 유지했습니다.
최종 검증은 아이템 43,278개, 이미지가 있는 아이템 41,713개,
연결 WebP 22,862개와 레이어 시트 16,246개를 확인했습니다.
