/**
 * `imageOps` 의 순수 픽셀 함수와 브라우저 캔버스 사이를 잇는 얇은 배선.
 *
 * 여기만 DOM 을 안다. 이미지를 읽어 들이고, 결과를 PNG 로 굽고, 화면에 붙일
 * data URL 을 만든다. 잘라내기 판단은 전부 `imageOps` 에 있다.
 */

import type { RgbaImage } from './imageOps';

/** 캔버스를 만들어 한 번 쓰고 버린다. 붙여 넣기는 자주 일어나는 일이 아니다. */
function drawToCanvas(image: RgbaImage): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('캔버스를 열 수 없어 이미지를 다룰 수 없습니다.');

  // ImageData 는 자기 버퍼를 가져야 한다. 넘어온 배열을 그대로 쥐여 주지 않는다.
  const frame = context.createImageData(image.width, image.height);
  frame.data.set(image.data);
  context.putImageData(frame, 0, 0);

  return canvas;
}

/** 파일이나 클립보드에서 온 이미지를 픽셀로 편다. */
export async function readImage(source: Blob): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(source);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('캔버스를 열 수 없어 이미지를 다룰 수 없습니다.');

    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/** 화면 미리보기용. 알파가 살아 있어야 해서 PNG 로 굽는다. */
export function toDataUrl(image: RgbaImage): string {
  return drawToCanvas(image).toDataURL('image/png');
}

export async function toPngBlob(image: RgbaImage): Promise<Blob> {
  const canvas = drawToCanvas(image);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG 로 굽지 못했습니다.'));
    }, 'image/png');
  });
}

/** 개발 서버로 보낼 때 쓴다. 멀티파트를 쓰자고 엔드포인트를 복잡하게 만들 이유가 없다. */
export async function toBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // 인자를 한꺼번에 펼치면 큰 아이콘에서 콜스택이 넘친다. 조각내서 넘긴다.
  const CHUNK = 0x8000;
  for (let i = 0; i < buffer.length; i += CHUNK) {
    binary += String.fromCharCode(...buffer.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** 붙여 넣기나 드래그로 들어온 것 중 이미지 하나. 없으면 null. */
export function pickImageFile(transfer: DataTransfer | null): File | null {
  if (!transfer) return null;
  for (const item of transfer.files) {
    if (item.type.startsWith('image/')) return item;
  }
  return null;
}
