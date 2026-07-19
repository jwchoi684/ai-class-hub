import { afterEach, describe, expect, it, vi } from "vitest";
import { getBaseUrl } from "./site";

/*
 * QR 코드가 이 값을 인코딩합니다. 틀리면 수업 중에 20명이 못 들어오고,
 * 인쇄해 뒀다면 다시 뽑아야 합니다.
 */
describe("getBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("환경변수가 없으면 로컬 주소", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", undefined);
    expect(getBaseUrl()).toBe("http://localhost:3000");
  });

  it("Vercel 프로덕션 도메인에 https 를 붙인다", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "ai-class.vercel.app");
    expect(getBaseUrl()).toBe("https://ai-class.vercel.app");
  });

  it("명시적 설정이 Vercel 값보다 우선한다", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://custom.example.com");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "ai-class.vercel.app");
    expect(getBaseUrl()).toBe("https://custom.example.com");
  });

  it("끝의 슬래시를 떼서 QR 주소가 중복 슬래시로 깨지지 않게 한다", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://custom.example.com/");
    expect(getBaseUrl()).toBe("https://custom.example.com");
  });
});
