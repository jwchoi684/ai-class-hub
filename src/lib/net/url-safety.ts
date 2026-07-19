/**
 * 외부 URL 검증.
 *
 * 두 가지를 막습니다.
 *
 * 1. **XSS** — 저장된 주소는 나중에 `<a href>` 로 렌더됩니다. `javascript:`
 *    스킴을 그대로 넣으면 클릭 한 번에 스크립트가 돕니다. React 가 일부를
 *    막아주지만 의존할 것이 아니고, 애초에 저장하지 않는 편이 확실합니다.
 *
 * 2. **SSRF 준비** — 나중에 OG 메타를 가져오려면 서버가 이 주소를 fetch 합니다.
 *    그 순간 사설 대역·루프백·클라우드 메타데이터 주소가 공격 대상이 됩니다.
 *    호스트 형태로 걸러낼 수 있는 것은 지금 걸러둡니다. (DNS 해석 후 재확인은
 *    실제 fetch 를 구현할 때 함께 붙입니다 — 이름은 공인 IP 로 보여도 사설
 *    주소로 해석될 수 있기 때문입니다.)
 */

export type UrlVerdict =
  | { ok: true; normalized: string; host: string }
  | { ok: false; reason: string };

const MAX_LENGTH = 2048;

/** 루프백·사설·링크로컬·CGNAT 대역. 문자열 형태로 걸러낼 수 있는 것들. */
function isBlockedHost(host: string): boolean {
  const lower = host.toLowerCase();

  if (lower === "localhost" || lower.endsWith(".localhost")) return true;
  if (lower.endsWith(".internal") || lower.endsWith(".local")) return true;

  /*
   * IPv6 리터럴은 전부 막습니다.
   *
   * 개별 대역을 하나씩 거르려다 실제로 뚫렸습니다: `[::ffff:10.0.0.1]` 을
   * URL 에 넣으면 Node 가 `[::ffff:a00:1]` 로 **정규화**해 버려서, 점 표기를
   * 기대한 검사가 그냥 통과합니다. IPv6 는 같은 주소를 쓰는 방법이 여러 가지라
   * 이런 구멍이 계속 생깁니다.
   *
   * 이 앱에서 수강생이 공유할 주소는 도메인 이름이지 IPv6 리터럴이 아닙니다.
   * 정당한 용례가 없는 입력 형태는 통째로 막는 편이 안전합니다.
   */
  if (lower.startsWith("[")) return true;

  if (/^\d+\.\d+\.\d+\.\d+$/.test(lower)) return isBlockedIpv4(lower);

  return false;
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // 형태가 이상하면 막습니다.
  }

  const [a, b] = parts as [number, number, number, number];

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 사설
  if (a === 127) return true; // 루프백
  if (a === 169 && b === 254) return true; // 링크로컬 + 클라우드 메타데이터
  if (a === 172 && b >= 16 && b <= 31) return true; // 사설
  if (a === 192 && b === 168) return true; // 사설
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // 멀티캐스트 · 예약

  return false;
}

export function isSafeExternalUrl(raw: string): UrlVerdict {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { ok: false, reason: "주소를 입력해주세요." };
  }
  if (trimmed.length > MAX_LENGTH) {
    return { ok: false, reason: "주소가 너무 길어요." };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      ok: false,
      reason: "주소 형식이 올바르지 않아요. https:// 로 시작하는 주소를 넣어주세요.",
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    // javascript:, data:, file: 등. 사용자에게는 원인을 짧게만 알려줍니다.
    return { ok: false, reason: "http 또는 https 주소만 넣을 수 있어요." };
  }

  // user:pass@host 형태. 피싱에 쓰이고 fetch 시 자격증명이 새어 나갑니다.
  if (url.username || url.password) {
    return { ok: false, reason: "아이디·비밀번호가 포함된 주소는 넣을 수 없어요." };
  }

  if (url.port && url.port !== "80" && url.port !== "443") {
    return { ok: false, reason: "일반 웹 주소(80·443 포트)만 넣을 수 있어요." };
  }

  if (isBlockedHost(url.hostname)) {
    return { ok: false, reason: "외부에서 접근할 수 없는 주소예요." };
  }

  if (!url.hostname.includes(".") && !url.hostname.startsWith("[")) {
    return { ok: false, reason: "주소 형식이 올바르지 않아요." };
  }

  return { ok: true, normalized: url.toString(), host: url.hostname };
}

/** 카드에 보여줄 도메인. `www.` 는 떼서 짧게 만듭니다. */
export function displayHost(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
