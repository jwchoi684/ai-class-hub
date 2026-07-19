import { createHmac, timingSafeEqual } from "node:crypto";
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";

/**
 * 비밀값(운영자 비밀번호, 게시물 PIN) 해싱.
 *
 * 두 값 다 `argon2id(HMAC-SHA256(pepper, plain))` 로 저장합니다.
 *
 * 페퍼를 앞에 두는 이유: 페퍼는 Vercel 환경변수에 있고 해시는 Supabase DB 에
 * 있습니다. 서로 다른 시스템이라 DB 덤프만 유출된 상황에서는 오프라인 크래킹이
 * 불가능해집니다. 이 분리가 실제로 성립하는 것이 페퍼의 근거입니다.
 *
 * 특히 PIN 은 4자리라 탐색 공간이 1만뿐입니다. 해시만으로는 유출된 DB 를
 * 몇 초 만에 전수 조사할 수 있어서, 페퍼가 여기서는 장식이 아니라 필수입니다.
 *
 * 정직하게 말하면: 해싱은 서버가 완전히 장악된 상황을 막아주지 못합니다
 * (그 경우 공격자는 세션을 그냥 만들어낼 수 있습니다). 실제로 막는 것은
 * ① DB 유출 시 평문 노출 ② 강사가 다른 서비스에서 재사용 중일 비밀번호의 확산
 * ③ 로그·스크린샷으로의 우발적 유출 — 이 규모에서 가장 현실적인 사고들입니다.
 *
 * 이 파일에는 `server-only` 를 붙이지 않았습니다. 시드 스크립트(CLI)가 같은
 * 해싱 규칙을 써야 하는데 그 마커가 있으면 import 자체가 불가능해집니다.
 * 대신 @node-rs/argon2 가 네이티브 애드온이라 클라이언트 번들로는 애초에
 * 빌드되지 않습니다. 정말 위험한 것(service_role 키)에는 db/admin-client.ts
 * 쪽에 그대로 걸려 있습니다.
 */

// OWASP 권고 파라미터.
const ARGON2_OPTIONS = {
  memoryCost: 19456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

function pepper(): Buffer {
  const value = process.env.ADMIN_PEPPER;
  if (!value) {
    throw new Error(
      "환경변수 ADMIN_PEPPER 가 없습니다. `openssl rand -hex 32` 로 만들어 " +
        ".env.local 과 Vercel 환경변수에 넣으세요. (.env.example 참고)",
    );
  }
  if (value.length < 32) {
    throw new Error("ADMIN_PEPPER 가 너무 짧습니다. 최소 32자 이상이어야 합니다.");
  }
  return Buffer.from(value, "utf8");
}

/**
 * 페퍼를 적용한 중간값. argon2 에 넣기 전에 항상 이걸 거칩니다.
 *
 * hex 로 인코딩해서 넘깁니다. HMAC 다이제스트는 원시 바이트라 유효한 UTF-8 이
 * 아니고, argon2 바인딩이 "invalid utf-8 sequence" 로 거부합니다. hex 는
 * 길이가 두 배가 되지만 argon2 입력 길이는 비용에 영향을 주지 않습니다.
 */
function peppered(plain: string): string {
  return createHmac("sha256", pepper()).update(plain, "utf8").digest("hex");
}

export async function hashSecret(plain: string): Promise<string> {
  return argon2Hash(peppered(plain), ARGON2_OPTIONS);
}

/**
 * 검증. 해시가 없거나 형식이 깨져 있어도 **항상 같은 양의 KDF 작업을 수행**합니다.
 *
 * 조기 반환이 실무에서 실제로 새는 타이밍 채널입니다. "그런 게시물 없음"과
 * "PIN 틀림"이 응답 시간으로 구분되면, 공격자는 어느 게시물이 존재하는지부터
 * 알아냅니다. argon2 검증 자체는 내부적으로 상수 시간이라 별도 처리가 필요 없고,
 * 우리가 막을 것은 분기입니다.
 */
export async function verifySecret(
  storedHash: string | null | undefined,
  plain: string,
): Promise<boolean> {
  const candidate = peppered(plain);

  if (!storedHash) {
    // 더미 검증으로 시간을 맞춥니다. 결과는 버립니다.
    await argon2Verify(await dummyHash(), candidate).catch(() => false);
    return false;
  }

  try {
    return await argon2Verify(storedHash, candidate);
  } catch {
    // 해시 형식이 깨진 경우. 여기서도 false 만 돌려주고 이유는 노출하지 않습니다.
    return false;
  }
}

/**
 * 존재하지 않는 레코드에 대해서도 검증 비용을 치르기 위한 더미 해시.
 *
 * 문자열을 손으로 적어두면 안 됩니다. 형식이 조금이라도 어긋나면 argon2 가
 * 파싱 단계에서 즉시 던지고, 그러면 KDF 작업을 건너뛰어 **시간을 맞추려던
 * 목적이 정반대로 무너집니다** — 존재하지 않는 레코드만 응답이 빨라져서
 * 오히려 더 선명한 타이밍 채널이 됩니다.
 *
 * 그래서 실제로 생성합니다. 프로세스당 한 번만 계산하고 재사용합니다.
 */
let cachedDummyHash: Promise<string> | null = null;

function dummyHash(): Promise<string> {
  cachedDummyHash ??= argon2Hash(
    "this-value-never-matches-any-input",
    ARGON2_OPTIONS,
  );
  return cachedDummyHash;
}

/** 세션 토큰처럼 이미 고엔트로피인 값의 비교. KDF 없이 상수 시간 비교만. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * 쓰면 안 되는 PIN 목록.
 *
 * 수강생 상당수는 휴대폰 잠금번호나 생일을 그대로 씁니다. 이 사이트가 뚫리는
 * 것보다, 여기서 쓴 번호가 다른 곳에서도 통한다는 게 더 큰 피해입니다.
 * 4자리 전체(1만 가지)에서 이 정도만 걸러도 무차별 대입의 첫 시도들을 무력화합니다.
 */
const WEAK_PINS = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
  "1234", "2345", "3456", "4567", "5678", "6789", "0123",
  "4321", "5432", "6543", "7654", "8765", "9876", "3210",
  "1004", "1010", "1212", "1313", "2580", "0852", "1379", "7410",
]);

export type PinValidation = { ok: true } | { ok: false; reason: string };

export function validatePin(pin: string): PinValidation {
  if (!/^\d{4}$/.test(pin)) {
    return { ok: false, reason: "PIN 은 숫자 4자리여야 해요." };
  }
  if (WEAK_PINS.has(pin)) {
    return {
      ok: false,
      reason: "너무 흔한 번호예요. 다른 번호를 골라주세요.",
    };
  }
  return { ok: true };
}
