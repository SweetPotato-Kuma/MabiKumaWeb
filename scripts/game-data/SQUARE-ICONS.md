# 정사각 아이템 아이콘 갱신

게임과 안티치트를 실행하지 않고, 이미 추출된 DDS와 웹의 등록 이미지만 처리한다.
Python 3.10 이상과 Pillow 12.3 이상, NumPy가 설치된 분석 환경을 사용한다. 웹 앱에는 새 의존성을 추가하지 않는다.

저장소 루트에서 실행한다. `ICONS`는 패키지별로 풀린 DDS 폴더(`<패키지>/data/gfx/image/*.dds`,
`<패키지>/data/gfx/image2/inven/**/*.dds`, 추출 결과의 `originals/`)이고, `ITEMDB`는 `ItemDB*.xml`이 들어 있는 폴더다.
기존 추출 도구로 새 클라이언트를 처리한 다음 이 두 경로만 새 결과로 바꾸면 된다.
등록 아이콘 캐시(`.cache/item-cards/icons`, `uploaded.json`, `resourcedata.bin.br`)도 필요하다.

```powershell
node scripts/game-data/snapshot-icon-references.mjs
python scripts/game-data/prepare-square-icons.py --client-icons ICONS --itemdb ITEMDB --live-index .cache/square-icons/live-input.json --live-icons .cache/square-icons/live-icons --output .cache/square-icons/files --manifest .cache/square-icons/aliases.json --report .cache/square-icons/build --workers 4
python scripts/game-data/publish-square-icons.py --manifest .cache/square-icons/aliases.json --source .cache/square-icons/files
python scripts/game-data/test_square_icons.py
npm run typecheck
npm run lint
npm test
npm run build
```

첫 명령은 웹의 공개 등록 목록과 PNG를 읽고 콘텐츠 해시를 검증한다. 서버에 쓰는 요청은 없다.
이후 두 Python 명령은 로컬 파일만 처리한다. 변환에 실패하면 배포하지 말고 보고서의 `errors`를 확인한다.
원본이 완전히 투명한 항목은 `skipped`로 기록하며 게시할 그림을 만들지 않는다.

## 클라이언트 그림과 등록 그림의 대응

아이템 번호로 ItemDB의 `File_InvImage`를 찾고, 같은 이름의 DDS를 쓴다. 옛 아이콘은 `data/gfx/image/` 바로 아래,
새 아이콘은 `data/gfx/image2/inven/<분류>/` 아래에 있다. `a;b`는 두 그림을 겹친 것이고 `;a<10;b`는 개수에 따라
하나를 고르는 것이라 각 이름과 겹친 조합을 모두 후보로 본다.

DDS는 2의 거듭제곱 크기 텍스처에 회색 레이어 프레임을 가로로 이어 붙인 것이다. 프레임 크기는 등록 그림 크기
(인벤토리 칸당 24px)와 같다. 게임은 프레임 k를 염색 색 k로 `clamp(2 × 회색 + 색 − 256)` 계산해 차례로 겹친다.
색은 `App_Color1~3`이 가리키는 팔레트(`ColorTable.xml`)에서 아이템마다 뽑히므로 클라이언트만으로는 정해지지 않는다.
그래서 각 프레임이 맨 위에 보이는 픽셀로 등록 그림의 색을 거꾸로 읽어 클라이언트 레이어에 입힌다.
등록 그림에 없는 효과 프레임(빛나는 외곽선, 반짝이)은 빼는 편이 더 맞으면 뺀다.
알파 실루엣 일치도 99% 이상, 불투명 픽셀 평균 색 오차 3 이하인 경우만 채택한다.
일치하지 않거나 클라이언트에 없는 항목은 현재 등록 그림을 정규화한다. 이 구분은 `images.jsonl`의 `method`에 남는다.

보이는 영역의 투명 여백을 자르고 비율을 유지해 긴 변 120px로 맞춘다. 투명한 128x128 캔버스 중앙에 배치하며
홀수 픽셀 차이는 좌우 또는 상하 1px 이내다. WebP는 무손실로 저장하고 다시 열어 RGBA 일치와 중앙 정렬을 검증한다.
원본이 작은 이미지의 세부 묘사가 새로 생기지는 않는다.

게시 파일은 `public/data/item-icons/<기존 PNG 해시>.webp`다. 동일한 그림은 Git에서 같은 바이너리를 공유한다.
`src/features/itemcard/generated/squareIconVersion.json`이 캐시 갱신용 버전이며 큰 대응표를 앱 번들에 넣지 않는다.
방문자가 예전 카드를 가지고 있어도 같은 해시로 새 그림을 찾는다. 이후 신규 등록되어 변환본이 없는 항목은
기존 이미지 주소로 돌아간다. 카테고리, 아이템 이름, 설명, 서버의 원본 PNG는 바꾸지 않는다.

보고서는 `.cache/square-icons/`에 남으며 Git에는 포함하지 않는다. 공개 이미지와 버전 파일, 관련 코드만 커밋한다.
