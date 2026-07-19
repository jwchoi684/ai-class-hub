/**
 * 업로드 전 브라우저에서 이미지를 다시 인코딩합니다.
 *
 * 이 한 군데가 네 가지 문제를 동시에 해결합니다 (docs/REQUIREMENTS.md §2.5):
 *
 *  1. **위치정보 제거** — 폰 사진에는 GPS EXIF 가 붙어 있습니다. 집에서 찍은
 *     작업 사진을 올리면 집 좌표가 공개 웹에 올라갑니다. canvas 로 다시
 *     그리면 픽셀만 남고 메타데이터는 사라집니다.
 *  2. **HEIC → JPEG** — 아이폰 사진은 업로더 본인의 사파리에서는 잘 보이는데
 *     노트북 크롬에서는 깨집니다. 정작 올린 사람은 문제를 인지하지 못합니다.
 *  3. **강의실 와이파이** — "다 같이 갤러리 열어보세요" 할 때 20명이 3~8MB
 *     사진 수십 장을 동시에 받습니다. 용량이 20분의 1이 됩니다.
 *  4. **무료 티어 용량** — Storage 와 대역폭 둘 다.
 *
 * 다만 이건 **보안 수단이 아닙니다**. 클라이언트는 얼마든지 우회할 수 있으므로
 * 서버가 매직바이트로 다시 검증합니다.
 */

/** 긴 변 기준. 카드 그리드와 상세 화면 모두 이 이상은 필요 없습니다. */
const MAX_EDGE = 1600;
const QUALITY = 0.82;

export type ResizedImage = {
  blob: Blob;
  width: number;
  height: number;
  /** 원본 대비 얼마나 줄었는지 — 사용자에게 보여주진 않고 디버깅용입니다. */
  originalBytes: number;
};

export async function resizeImage(file: File): Promise<ResizedImage> {
  const bitmap = await loadBitmap(file);

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지를 처리할 수 없어요.");

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", QUALITY);
  });

  if (!blob) throw new Error("이미지를 변환하지 못했어요.");

  return { blob, width, height, originalBytes: file.size };
}

/**
 * createImageBitmap 은 EXIF 회전을 자동으로 반영합니다.
 * 이게 없으면 세로로 찍은 폰 사진이 눕습니다.
 */
async function loadBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    /*
     * HEIC 처럼 브라우저가 디코드하지 못하는 형식.
     * iOS 사파리는 <input type=file> 업로드 시 대체로 JPEG 로 변환해 주지만
     * 항상은 아니라서, 여기서 명확한 한국어 안내로 끝냅니다.
     */
    throw new Error(
      "이 이미지 형식은 열 수 없어요. JPG 나 PNG 로 저장해서 올려주세요.",
    );
  }
}
