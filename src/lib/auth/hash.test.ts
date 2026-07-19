import { beforeAll, describe, expect, it } from "vitest";
import { hashSecret, safeEqual, validatePin, verifySecret } from "./hash";

/*
 * 권한 판정 로직이라 조용히 회귀하면 그대로 뚫립니다.
 * (docs/REQUIREMENTS.md §7 의 유닛 테스트 필수 대상)
 */

beforeAll(() => {
  process.env.ADMIN_PEPPER = "테스트용-페퍼-".repeat(4) + "0123456789abcdef";
});

describe("hashSecret / verifySecret", () => {
  it("맞는 값을 통과시킨다", async () => {
    const hash = await hashSecret("올바른-비밀번호-12345");
    expect(await verifySecret(hash, "올바른-비밀번호-12345")).toBe(true);
  });

  it("틀린 값을 거부한다", async () => {
    const hash = await hashSecret("올바른-비밀번호-12345");
    expect(await verifySecret(hash, "틀린-비밀번호-12345")).toBe(false);
  });

  it("평문을 저장하지 않는다", async () => {
    const hash = await hashSecret("1234");
    expect(hash).not.toContain("1234");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("같은 값이라도 매번 다른 해시가 나온다 (솔트)", async () => {
    const a = await hashSecret("1234");
    const b = await hashSecret("1234");
    expect(a).not.toBe(b);
    // 그래도 둘 다 검증은 통과해야 한다
    expect(await verifySecret(a, "1234")).toBe(true);
    expect(await verifySecret(b, "1234")).toBe(true);
  });

  it("페퍼가 다르면 검증에 실패한다 — DB만 유출돼도 크래킹이 안 되는 근거", async () => {
    const hash = await hashSecret("1234");
    process.env.ADMIN_PEPPER = "완전히-다른-페퍼-".repeat(3) + "fedcba9876543210";
    expect(await verifySecret(hash, "1234")).toBe(false);
    process.env.ADMIN_PEPPER = "테스트용-페퍼-".repeat(4) + "0123456789abcdef";
  });

  it("해시가 없어도 던지지 않고 false 를 준다", async () => {
    expect(await verifySecret(null, "1234")).toBe(false);
    expect(await verifySecret(undefined, "1234")).toBe(false);
    expect(await verifySecret("", "1234")).toBe(false);
  });

  it("해시 형식이 깨져 있어도 던지지 않는다", async () => {
    expect(await verifySecret("이건-argon2-해시가-아님", "1234")).toBe(false);
  });

  it("레코드가 없을 때도 KDF 비용을 치른다 — 존재 여부가 응답 시간으로 새지 않게", async () => {
    const hash = await hashSecret("1234");

    // 캐시된 더미 해시를 먼저 준비시켜 첫 호출의 생성 비용을 제외한다.
    await verifySecret(null, "warmup");

    const t0 = performance.now();
    await verifySecret(null, "1234");
    const missing = performance.now() - t0;

    const t1 = performance.now();
    await verifySecret(hash, "틀린값");
    const wrong = performance.now() - t1;

    // 조기 반환이면 missing 이 0에 가깝게 나온다. 두 경로가 같은 자릿수인지만 본다.
    expect(missing).toBeGreaterThan(wrong * 0.3);
  });
});

describe("validatePin", () => {
  it("숫자 4자리만 받는다", () => {
    expect(validatePin("5397").ok).toBe(true);
    expect(validatePin("123").ok).toBe(false);
    expect(validatePin("12345").ok).toBe(false);
    expect(validatePin("abcd").ok).toBe(false);
    expect(validatePin("12a4").ok).toBe(false);
    expect(validatePin("").ok).toBe(false);
  });

  it("흔한 번호를 거부한다", () => {
    for (const weak of ["0000", "1234", "1111", "4321", "2580", "1004"]) {
      const result = validatePin(weak);
      expect(result.ok, `${weak} 는 거부돼야 함`).toBe(false);
    }
  });

  it("거부 사유가 사용자에게 보여줄 만한 한국어다", () => {
    const result = validatePin("1234");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.length).toBeGreaterThan(5);
      expect(result.reason).not.toContain("Error");
    }
  });
});

describe("safeEqual", () => {
  it("같은 문자열", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true);
  });

  it("다른 문자열", () => {
    expect(safeEqual("abc123", "abc124")).toBe(false);
  });

  it("길이가 다르면 던지지 않고 false", () => {
    expect(safeEqual("abc", "abcdef")).toBe(false);
  });
});
