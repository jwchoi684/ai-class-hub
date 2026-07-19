import { describe, expect, it } from "vitest";
import { describeDevice } from "./device";

describe("describeDevice", () => {
  it("맥 크롬", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      ),
    ).toBe("Mac · Chrome");
  });

  it("맥 사파리 — Chrome 문자열이 없어야 사파리로 잡힌다", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      ),
    ).toBe("Mac · Safari");
  });

  it("윈도우 엣지 — UA 에 Chrome·Safari 가 다 있어도 Edge 로 잡혀야 한다", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
      ),
    ).toBe("Windows · Edge");
  });

  it("아이폰 사파리 — 수업 중 가장 흔한 기기", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("iPhone/iPad · Safari");
  });

  it("안드로이드 크롬", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      ),
    ).toBe("Android · Chrome");
  });

  it("파이어폭스", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
      ),
    ).toBe("Windows · Firefox");
  });

  it("값이 없으면 던지지 않는다", () => {
    expect(describeDevice(null)).toBe("알 수 없는 기기");
    expect(describeDevice(undefined)).toBe("알 수 없는 기기");
    expect(describeDevice("")).toBe("알 수 없는 기기");
  });

  it("알아볼 수 없는 문자열도 던지지 않는다", () => {
    expect(describeDevice("curl/8.4.0")).toBe("기타 · 브라우저");
  });
});
