/**
 * User-Agent 를 사람이 알아볼 만한 한 줄로 줄입니다.
 *
 * 정확한 브라우저 판별이 목적이 아닙니다. 관리 화면에서 "이게 내 노트북인지
 * 강의실 PC인지" 구분되기만 하면 됩니다 — 그 구분이 [모든 기기 로그아웃]을
 * 누를지 결정하는 유일한 근거이기 때문입니다.
 */
export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return "알 수 없는 기기";

  const os = /iPhone|iPad|iPod/.test(userAgent)
    ? "iPhone/iPad"
    : /Android/.test(userAgent)
      ? "Android"
      : /Macintosh|Mac OS X/.test(userAgent)
        ? "Mac"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "기타";

  // 순서가 중요합니다. Edge 의 UA 에는 Chrome 과 Safari 가 모두 들어 있고,
  // Chrome 의 UA 에도 Safari 가 들어 있습니다. 좁은 것부터 검사합니다.
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "브라우저";

  return `${os} · ${browser}`;
}
