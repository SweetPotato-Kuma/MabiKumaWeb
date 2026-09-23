import { describe, expect, it } from 'vitest';
import {
  analyzeTooltipImage,
  cropImage,
  findIconBox,
  findTooltipPanel,
  removeBackground,
  scaleNearest,
  trimTransparent,
  type RgbaImage,
} from './imageOps';

/**
 * 테스트 이미지는 손으로 그린다.
 *
 * 실제 스크린샷을 픽스처로 넣으면 저장소에 바이너리가 쌓이고, 왜 이 숫자가 나왔는지
 * 나중에 아무도 모른다. 여기서는 "인벤토리 바탕 위에 아이콘, 오른쪽에 검은 툴팁" 이라는
 * 구조만 재현한다. 실측값(패널 바탕 #121212, 칸 바탕 #5d5855)을 그대로 쓴다.
 */
function blankImage(width: number, height: number, color: [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = color[0];
    data[i * 4 + 1] = color[1];
    data[i * 4 + 2] = color[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function fillRect(
  image: RgbaImage,
  rect: { x: number; y: number; width: number; height: number },
  color: [number, number, number],
): void {
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const offset = (y * image.width + x) * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = 255;
    }
  }
}

const SLOT_GREY: [number, number, number] = [0x5d, 0x58, 0x55];
const PANEL_BLACK: [number, number, number] = [0x12, 0x12, 0x12];
const BOTTLE_RED: [number, number, number] = [0x8e, 0x1f, 0x22];

/** 실제 스크린샷과 같은 배치. 왼쪽에 아이콘, 오른쪽 아래로 툴팁. */
function sampleScreenshot(): RgbaImage {
  const image = blankImage(200, 140, SLOT_GREY);
  fillRect(image, { x: 80, y: 40, width: 120, height: 100 }, PANEL_BLACK);
  fillRect(image, { x: 20, y: 15, width: 18, height: 40 }, BOTTLE_RED);
  return image;
}

describe('findTooltipPanel', () => {
  it('툴팁 패널의 경계를 찾는다', () => {
    expect(findTooltipPanel(sampleScreenshot())).toEqual({ x: 80, y: 40, width: 120, height: 100 });
  });

  it('인벤토리 격자선이 패널에 닿아 있어도 격자선까지 패널로 세지 않는다', () => {
    const image = sampleScreenshot();
    // 패널 왼쪽 변에 붙은 1px 격자선. 붙어 있으니 같은 덩어리로 이어진다.
    fillRect(image, { x: 0, y: 70, width: 80, height: 1 }, PANEL_BLACK);

    expect(findTooltipPanel(image)).toEqual({ x: 80, y: 40, width: 120, height: 100 });
  });

  it('어두운 덩어리가 너무 작으면 툴팁으로 보지 않는다', () => {
    const image = blankImage(200, 140, SLOT_GREY);
    fillRect(image, { x: 10, y: 10, width: 20, height: 20 }, PANEL_BLACK);

    expect(findTooltipPanel(image)).toBeNull();
  });

  it('어두운 곳이 아예 없으면 null 이다', () => {
    expect(findTooltipPanel(blankImage(200, 140, SLOT_GREY))).toBeNull();
  });
});

describe('findIconBox', () => {
  it('인벤토리 칸 위의 아이콘을 찾는다', () => {
    const image = sampleScreenshot();
    const panel = findTooltipPanel(image);

    expect(findIconBox(image, panel)).toEqual({ x: 20, y: 15, width: 18, height: 40 });
  });

  it('끊어진 조각을 한 아이콘으로 합친다', () => {
    const image = blankImage(200, 140, SLOT_GREY);
    fillRect(image, { x: 80, y: 40, width: 120, height: 100 }, PANEL_BLACK);
    // 병뚜껑과 몸통 사이에 어두운 띠가 있어 채도 기준으로는 두 덩어리가 된다.
    fillRect(image, { x: 24, y: 12, width: 8, height: 10 }, BOTTLE_RED);
    fillRect(image, { x: 20, y: 26, width: 18, height: 28 }, BOTTLE_RED);

    expect(findIconBox(image, findTooltipPanel(image))).toEqual({
      x: 20,
      y: 12,
      width: 18,
      height: 42,
    });
  });

  it('화면 끝에 닿는 게임 배경은 아이콘으로 세지 않는다', () => {
    const image = sampleScreenshot();
    // 툴팁 뒤로 보이는 나무 바닥. 색이 진하지만 화면 가장자리에 닿는다.
    fillRect(image, { x: 0, y: 0, width: 70, height: 10 }, [0xd0, 0x8a, 0x30]);

    expect(findIconBox(image, findTooltipPanel(image))).toEqual({
      x: 20,
      y: 15,
      width: 18,
      height: 40,
    });
  });

  it('아이콘으로 볼 만한 것이 없으면 null 이다', () => {
    const image = blankImage(200, 140, SLOT_GREY);
    fillRect(image, { x: 80, y: 40, width: 120, height: 100 }, PANEL_BLACK);

    expect(findIconBox(image, findTooltipPanel(image))).toBeNull();
  });
});

describe('removeBackground', () => {
  it('테두리에서 이어진 바탕만 지우고 아이콘은 남긴다', () => {
    const image = blankImage(30, 30, SLOT_GREY);
    fillRect(image, { x: 10, y: 10, width: 10, height: 10 }, BOTTLE_RED);

    const cut = removeBackground(image);
    const alphaAt = (x: number, y: number) => cut.data[(y * cut.width + x) * 4 + 3];

    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(14, 14)).toBe(255);
  });

  it('아이콘 안에 갇힌 바탕색은 남긴다', () => {
    const image = blankImage(30, 30, SLOT_GREY);
    fillRect(image, { x: 8, y: 8, width: 14, height: 14 }, BOTTLE_RED);
    // 병 안에 비치는 회색. 바탕과 같은 색이지만 테두리에서 이어져 있지 않다.
    fillRect(image, { x: 13, y: 13, width: 4, height: 4 }, SLOT_GREY);

    const cut = removeBackground(image);

    expect(cut.data[(15 * cut.width + 15) * 4 + 3]).toBe(255);
  });

  it('테두리 색이 제각각이면 지울 바탕을 못 고르고 그림을 남긴다', () => {
    // 아이템이 테두리까지 꽉 찬 크롭. 지울 바탕이 없으니 그림이 살아 있어야 한다.
    const image = blankImage(20, 20, BOTTLE_RED);
    for (let i = 0; i < 20; i++) {
      fillRect(image, { x: i, y: 0, width: 1, height: 1 }, [i * 12, 255 - i * 12, i * 7]);
      fillRect(image, { x: i, y: 19, width: 1, height: 1 }, [255 - i * 12, i * 9, i * 12]);
      fillRect(image, { x: 0, y: i, width: 1, height: 1 }, [i * 5, i * 11, 255 - i * 12]);
      fillRect(image, { x: 19, y: i, width: 1, height: 1 }, [i * 13, i * 3, i * 10]);
    }

    const cut = removeBackground(image);
    const alphaAt = (x: number, y: number) => cut.data[(y * cut.width + x) * 4 + 3];

    expect(alphaAt(10, 10)).toBe(255);
    expect(trimTransparent(cut).width).toBe(20);
  });
});

describe('trimTransparent', () => {
  it('다 지워진 바깥 줄을 잘라낸다', () => {
    const image = blankImage(30, 30, SLOT_GREY);
    fillRect(image, { x: 10, y: 12, width: 8, height: 6 }, BOTTLE_RED);

    const trimmed = trimTransparent(removeBackground(image));

    expect(trimmed.width).toBe(8);
    expect(trimmed.height).toBe(6);
  });

  it('지울 것이 없으면 원본 그대로 둔다', () => {
    const image = blankImage(10, 10, BOTTLE_RED);

    expect(trimTransparent(image).width).toBe(10);
  });
});

describe('cropImage', () => {
  it('이미지 밖으로 나간 영역은 안쪽으로 물린다', () => {
    const image = blankImage(20, 20, SLOT_GREY);

    expect(cropImage(image, { x: 15, y: 15, width: 40, height: 40 })).toMatchObject({
      width: 5,
      height: 5,
    });
  });
});

describe('scaleNearest', () => {
  it('정수배로 키우고 색을 그대로 옮긴다', () => {
    const image = blankImage(2, 2, BOTTLE_RED);
    const scaled = scaleNearest(image, 3);

    expect(scaled.width).toBe(6);
    expect(scaled.height).toBe(6);
    expect([scaled.data[0], scaled.data[1], scaled.data[2]]).toEqual([...BOTTLE_RED]);
  });

  it('1배면 원본을 그대로 돌려준다', () => {
    const image = blankImage(4, 4, BOTTLE_RED);

    expect(scaleNearest(image, 1)).toBe(image);
  });
});

describe('analyzeTooltipImage', () => {
  it('패널과 아이콘을 한 번에 찾는다', () => {
    expect(analyzeTooltipImage(sampleScreenshot())).toEqual({
      panel: { x: 80, y: 40, width: 120, height: 100 },
      icon: { x: 20, y: 15, width: 18, height: 40 },
    });
  });
});
