import { describe, expect, it } from "vitest";
import {
  generatePassword,
  PASSWORD_ALPHABET,
  PASSWORD_LENGTH,
} from "./password";

describe("generatePassword", () => {
  it("요청한 길이를 정확히 지킨다", () => {
    expect(generatePassword()).toHaveLength(PASSWORD_LENGTH);
    expect(generatePassword(8)).toHaveLength(8);
    expect(generatePassword(64)).toHaveLength(64);
  });

  it("허용된 문자만 쓴다", () => {
    for (let i = 0; i < 50; i++) {
      for (const ch of generatePassword()) {
        expect(PASSWORD_ALPHABET, `'${ch}' 는 허용 문자가 아님`).toContain(ch);
      }
    }
  });

  it("헷갈리는 글자를 쓰지 않는다 — 화면에서 옮겨 적는 값이라 중요", () => {
    const confusing = ["0", "O", "1", "l", "I"];
    for (const ch of confusing) {
      expect(PASSWORD_ALPHABET).not.toContain(ch);
    }
  });

  it("매번 다른 값이 나온다", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generatePassword()));
    expect(seen.size).toBe(200);
  });

  it("문자 분포가 균등하다 — 거부 샘플링이 실제로 편향을 없애는지", () => {
    // 편향이 있으면 앞쪽 문자가 뒤쪽보다 자주 나온다.
    // 256 % 56 = 32 이므로, 거부 샘플링이 없으면 앞 32글자가 약 1.5배 뽑힌다.
    const counts = new Map<string, number>();
    const samples = 40_000;

    for (const ch of generatePassword(samples)) {
      counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }

    const expected = samples / PASSWORD_ALPHABET.length;
    const frequencies = [...counts.values()];
    const min = Math.min(...frequencies);
    const max = Math.max(...frequencies);

    // 모든 문자가 등장하고, 최빈/최소 빈도가 기댓값에서 크게 벗어나지 않아야 한다.
    expect(counts.size).toBe(PASSWORD_ALPHABET.length);
    expect(min).toBeGreaterThan(expected * 0.8);
    expect(max).toBeLessThan(expected * 1.2);
  });

  it("기본 길이는 충분한 엔트로피를 준다", () => {
    // log2(56) * 20 ≈ 116 비트
    const bits = Math.log2(PASSWORD_ALPHABET.length) * PASSWORD_LENGTH;
    expect(bits).toBeGreaterThan(100);
  });
});
