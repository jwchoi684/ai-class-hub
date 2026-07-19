import { describe, expect, it } from "vitest";
import { gradientCss, gradientFor } from "./thumbnail";

describe("gradientFor", () => {
  it("같은 주소는 언제나 같은 색 — 새로고침해도 카드 색이 안 바뀐다", () => {
    const a = gradientFor("https://cafe-pick.vercel.app");
    const b = gradientFor("https://cafe-pick.vercel.app");
    expect(a).toEqual(b);
  });

  it("다른 주소는 다른 색을 받는다", () => {
    const hues = new Set(
      [
        "https://cafe-pick.vercel.app",
        "https://mydog-intro.netlify.app",
        "https://colab.research.google.com",
        "https://study-timer.vercel.app",
        "https://recipe-ai.vercel.app",
      ].map((url) => gradientFor(url).hue),
    );
    // 5개가 전부 같은 색이면 해시가 죽은 것입니다.
    expect(hues.size).toBeGreaterThanOrEqual(4);
  });

  it("색상이 0~359 범위를 벗어나지 않는다", () => {
    for (let i = 0; i < 500; i++) {
      const { hue } = gradientFor(`https://example-${i}.com/path?q=${i}`);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it("빈 문자열에도 던지지 않는다", () => {
    expect(() => gradientFor("")).not.toThrow();
    expect(gradientFor("").hue).toBeGreaterThanOrEqual(0);
  });

  it("한글·이모지가 섞여도 동작한다", () => {
    expect(() => gradientFor("우리 강아지 소개 🐶")).not.toThrow();
    expect(gradientFor("우리 강아지 소개 🐶")).toEqual(
      gradientFor("우리 강아지 소개 🐶"),
    );
  });

  it("색상이 고르게 흩어진다 — 한 구역에 몰리지 않는다", () => {
    const buckets = new Array(6).fill(0);
    for (let i = 0; i < 600; i++) {
      buckets[Math.floor(gradientFor(`https://site-${i}.dev`).hue / 60)]! += 1;
    }
    // 완전 균등을 기대하진 않지만, 어느 구역도 비어 있으면 안 됩니다.
    for (const count of buckets) {
      expect(count).toBeGreaterThan(30);
    }
  });
});

describe("gradientCss", () => {
  it("CSS 에 바로 넣을 수 있는 값이다", () => {
    const css = gradientCss("https://example.com");
    expect(css).toMatch(/^linear-gradient\(135deg, hsl\(.+\), hsl\(.+\)\)$/);
  });
});
