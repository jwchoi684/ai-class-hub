import { describe, expect, it } from "vitest";
import { pickCurrentSession } from "./current-session";

const week = (orderNo: number, heldOn: string | null) => ({ orderNo, heldOn });

describe("pickCurrentSession", () => {
  const term = [
    week(1, "2026-07-29"),
    week(2, "2026-08-05"),
    week(3, "2026-08-12"),
    week(4, "2026-08-19"),
  ];

  it("회차가 없으면 null", () => {
    expect(pickCurrentSession([], "2026-08-12")).toBeNull();
  });

  it("수업 당일에는 그 회차", () => {
    expect(pickCurrentSession(term, "2026-08-12")?.orderNo).toBe(3);
  });

  it("수업 다음 날에도 여전히 그 회차 — 자료는 며칠 더 본다", () => {
    expect(pickCurrentSession(term, "2026-08-13")?.orderNo).toBe(3);
  });

  it("다음 수업 전날까지 그 회차", () => {
    expect(pickCurrentSession(term, "2026-08-18")?.orderNo).toBe(3);
  });

  it("다음 수업 당일이 되면 넘어간다", () => {
    expect(pickCurrentSession(term, "2026-08-19")?.orderNo).toBe(4);
  });

  it("첫 수업 전에는 첫 회차를 안내한다", () => {
    expect(pickCurrentSession(term, "2026-07-01")?.orderNo).toBe(1);
  });

  it("첫 수업 전날에도 첫 회차", () => {
    expect(pickCurrentSession(term, "2026-07-28")?.orderNo).toBe(1);
  });

  it("종강 후에는 마지막 회차에 머문다", () => {
    expect(pickCurrentSession(term, "2026-12-25")?.orderNo).toBe(4);
  });

  it("입력 순서가 뒤죽박죽이어도 결과가 같다", () => {
    const shuffled = [term[2], term[0], term[3], term[1]];
    expect(pickCurrentSession(shuffled, "2026-08-13")?.orderNo).toBe(3);
  });

  it("날짜가 없는 회차가 섞여 있으면 날짜 있는 쪽으로 판정한다", () => {
    const mixed = [week(1, "2026-07-29"), week(2, null), week(3, "2026-08-12")];
    expect(pickCurrentSession(mixed, "2026-08-13")?.orderNo).toBe(3);
  });

  it("날짜가 하나도 없으면 번호가 가장 큰 회차", () => {
    const undated = [week(1, null), week(2, null), week(3, null)];
    expect(pickCurrentSession(undated, "2026-08-13")?.orderNo).toBe(3);
  });

  it("같은 날짜가 둘이면 번호가 큰 쪽 — 보강이 원 수업보다 뒤", () => {
    const sameDay = [week(3, "2026-08-12"), week(4, "2026-08-12")];
    expect(pickCurrentSession(sameDay, "2026-08-12")?.orderNo).toBe(4);
  });

  it("연말을 넘겨도 문자열 비교가 깨지지 않는다", () => {
    const acrossYear = [week(1, "2026-12-30"), week(2, "2027-01-06")];
    expect(pickCurrentSession(acrossYear, "2026-12-31")?.orderNo).toBe(1);
    expect(pickCurrentSession(acrossYear, "2027-01-06")?.orderNo).toBe(2);
  });

  it("한 자리 월·일이 0으로 채워진 형식을 전제한다", () => {
    // '2026-9-1' 같은 형식이 들어오면 사전순이 깨집니다. DB 의 date 컬럼은
    // 항상 0 을 채워 주므로 이 전제가 유지됩니다.
    const padded = [week(1, "2026-09-01"), week(2, "2026-10-01")];
    expect(pickCurrentSession(padded, "2026-09-15")?.orderNo).toBe(1);
  });
});
