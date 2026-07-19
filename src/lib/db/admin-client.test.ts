import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * Supabase 키 선택 로직.
 *
 * publishable 키를 서버에 잘못 넣으면 RLS 전면 거부에 걸려 데이터가 하나도
 * 안 보이는데, 에러가 아니라 '빈 목록'으로 나타나서 원인을 찾기 어렵습니다.
 * 그래서 시작할 때 형태로 잡습니다.
 */
describe("서버 키 선택", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function makeClient() {
    vi.resetModules();
    const { db } = await import("./admin-client");
    return db();
  }

  it("새 이름(SUPABASE_SECRET_KEY)을 읽는다", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
    await expect(makeClient()).resolves.toBeDefined();
  });

  it("예전 이름도 그대로 받는다 — 키 교체 중에 배포가 멈추지 않게", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "eyJhbGciOiJIUzI1NiJ9.legacy");
    await expect(makeClient()).resolves.toBeDefined();
  });

  it("새 이름이 예전 이름보다 우선한다", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_new");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "eyJhbGciOiJIUzI1NiJ9.old");
    await expect(makeClient()).resolves.toBeDefined();
  });

  it("publishable 키를 넣으면 시작할 때 막는다", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_publishable_wrong");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);

    await expect(makeClient()).rejects.toThrow(/publishable/);
  });

  it("키가 아예 없으면 어디서 가져오는지 알려준다", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);

    await expect(makeClient()).rejects.toThrow(/sb_secret/);
  });
});
