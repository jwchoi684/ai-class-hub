/**
 * 파일 앞부분 바이트로 실제 타입을 판별합니다.
 *
 * 확장자와 클라이언트가 보낸 Content-Type 은 둘 다 요청자가 정하는 값이라
 * 신뢰할 수 없습니다. `.pdf` 로 이름 붙인 HTML 을 올리면 브라우저가 그걸
 * HTML 로 렌더할 수 있고, Storage 는 별도 오리진이라 우리 쿠키에는 닿지
 * 못하지만 피싱 페이지를 우리 도메인처럼 보이게 호스팅하는 데는 충분합니다.
 *
 * 그래서 서버가 실제 바이트를 봅니다. 파일 전체를 함수 메모리에 올릴 필요는
 * 없고 앞 4KB 면 충분합니다.
 */

export type DetectedType = {
  /** Storage 에 기록할 MIME */
  mime: string;
  /** 사람에게 보여줄 이름 */
  label: string;
  /** 확장자 (경로 생성용) */
  extension: string;
  kind: "document" | "image" | "archive";
};

/** 업로드를 허용하는 타입. 여기 없는 것은 전부 거부입니다. */
const SIGNATURES: {
  type: DetectedType;
  test: (bytes: Uint8Array) => boolean;
}[] = [
  {
    type: { mime: "application/pdf", label: "PDF", extension: "pdf", kind: "document" },
    test: (b) => starts(b, [0x25, 0x50, 0x44, 0x46]), // %PDF
  },
  {
    type: { mime: "image/png", label: "PNG 이미지", extension: "png", kind: "image" },
    test: (b) => starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    type: { mime: "image/jpeg", label: "JPEG 이미지", extension: "jpg", kind: "image" },
    test: (b) => starts(b, [0xff, 0xd8, 0xff]),
  },
  {
    type: { mime: "image/gif", label: "GIF 이미지", extension: "gif", kind: "image" },
    test: (b) => starts(b, [0x47, 0x49, 0x46, 0x38]), // GIF8
  },
  {
    type: { mime: "image/webp", label: "WebP 이미지", extension: "webp", kind: "image" },
    // RIFF....WEBP — 크기 4바이트를 건너뛰고 확인해야 합니다.
    test: (b) =>
      starts(b, [0x52, 0x49, 0x46, 0x46]) &&
      b.length >= 12 &&
      matchesAt(b, 8, [0x57, 0x45, 0x42, 0x50]),
  },
  {
    /*
     * PPTX·DOCX·XLSX 는 전부 ZIP 컨테이너라 시그니처가 같습니다.
     * 여기서는 ZIP 으로만 판별하고, 실제 구분은 확장자에 맡깁니다 —
     * 어차피 셋 다 허용 목록에 있고, 위험한 것은 ZIP 이 아닌 무언가가
     * ZIP 인 척하는 경우인데 그건 시그니처로 걸러집니다.
     */
    type: {
      mime: "application/zip",
      label: "오피스 문서 또는 ZIP",
      extension: "zip",
      kind: "archive",
    },
    test: (b) =>
      starts(b, [0x50, 0x4b, 0x03, 0x04]) ||
      starts(b, [0x50, 0x4b, 0x05, 0x06]) ||
      starts(b, [0x50, 0x4b, 0x07, 0x08]),
  },
];

function starts(bytes: Uint8Array, signature: number[]): boolean {
  return matchesAt(bytes, 0, signature);
}

function matchesAt(
  bytes: Uint8Array,
  offset: number,
  signature: number[],
): boolean {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

/**
 * 실제 타입을 판별합니다. 허용 목록에 없으면 null.
 *
 * SVG 와 HTML 은 시그니처 목록에 아예 없으므로 자동으로 거부됩니다 —
 * 둘 다 스크립트를 실행할 수 있어서 명시적 예외를 두지 않습니다.
 */
export function detectFileType(bytes: Uint8Array): DetectedType | null {
  for (const { type, test } of SIGNATURES) {
    if (test(bytes)) return type;
  }
  return null;
}

/** 이미지 전용 경로(갤러리 결과물)에서 쓰는 좁은 판별. */
export function detectImageType(bytes: Uint8Array): DetectedType | null {
  const detected = detectFileType(bytes);
  return detected?.kind === "image" ? detected : null;
}

/**
 * 업로드 파일명 정리.
 *
 * 경로 구분자와 제어문자를 없앱니다. 그대로 두면 `../` 로 Storage 경로를
 * 벗어나려는 시도나, 다운로드 헤더에 개행을 끼워 넣는 시도가 통할 수 있습니다.
 * 한글은 그대로 둡니다 — 강사가 올린 '3주차 자료.pdf' 가 다운로드할 때
 * 알아볼 수 없는 이름이 되면 안 됩니다.
 */
export function sanitizeFileName(raw: string): string {
  const cleaned = raw
     
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[/\\]/g, "_")
    .replace(/^\.+/, "")
    .trim();

  const fallback = "파일";
  const limited = cleaned.slice(0, 120);
  return limited.length > 0 ? limited : fallback;
}
