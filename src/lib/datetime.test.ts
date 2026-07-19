import { describe, expect, it } from "vitest";
import {
  formatClassDate,
  formatClassDateLong,
  formatDate,
  formatDateIso,
  formatRelative,
  todayInKst,
} from "./datetime";

/*
 * 이 파일의 핵심은 "서버가 UTC 일 때도 한국 날짜가 맞게 나오는가" 하나입니다.
 * vitest.config.ts 가 TZ=UTC 를 강제하므로, 시간대를 고정하지 않은 구현은
 * 여기서 반드시 실패합니다.
 */

describe("formatDate — timestamptz 를 KST 날짜로", () => {
  it("한국 시간 밤 9시는 아직 같은 날이다 (UTC 로는 정오)", () => {
    // 2026-08-12T21:30 KST === 2026-08-12T12:30Z
    expect(formatDate(new Date("2026-08-12T12:30:00Z"))).toBe("8/12");
  });

  it("UTC 자정 직전이라도 한국은 이미 다음 날이다", () => {
    // 2026-08-12T23:30Z === 2026-08-13T08:30 KST
    expect(formatDate(new Date("2026-08-12T23:30:00Z"))).toBe("8/13");
  });

  it("한국 시간 자정 직후는 새 날짜로 넘어간다", () => {
    // 2026-08-12T15:00Z === 2026-08-13T00:00 KST
    expect(formatDate(new Date("2026-08-12T15:00:00Z"))).toBe("8/13");
  });

  it("한국 시간 자정 1분 전은 아직 전날이다", () => {
    // 2026-08-12T14:59Z === 2026-08-12T23:59 KST
    expect(formatDate(new Date("2026-08-12T14:59:00Z"))).toBe("8/12");
  });

  it("연말에는 해가 넘어간다", () => {
    // 2026-12-31T15:00Z === 2027-01-01T00:00 KST
    expect(formatDateIso(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
  });
});

describe("formatClassDate — date 컬럼은 시간대 변환 없이", () => {
  it("YYYY-MM-DD 를 그대로 읽는다", () => {
    expect(formatClassDate("2026-08-12")).toBe("8/12(수)");
  });

  it("요일이 맞다", () => {
    expect(formatClassDate("2026-08-16")).toBe("8/16(일)");
    expect(formatClassDate("2026-08-15")).toBe("8/15(토)");
  });

  it("긴 형식", () => {
    expect(formatClassDateLong("2026-08-12")).toBe("2026년 8월 12일 (수)");
  });

  it("달력 날짜는 시간대에 밀리지 않는다 — 1일이 전날로 새지 않는다", () => {
    // Date 로 파싱했다면 UTC 자정 → KST 오전 9시라 우연히 맞지만,
    // 반대 방향(음수 오프셋) 구현 실수를 잡기 위한 회귀 테스트.
    expect(formatClassDate("2026-01-01")).toBe("1/1(목)");
    expect(formatClassDateLong("2026-03-01")).toBe("2026년 3월 1일 (일)");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-08-13T05:00:00Z");

  it("1분 미만은 방금 전", () => {
    expect(formatRelative(new Date("2026-08-13T04:59:30Z"), now)).toBe("방금 전");
  });

  it("분 단위", () => {
    expect(formatRelative(new Date("2026-08-13T04:45:00Z"), now)).toBe("15분 전");
  });

  it("시간 단위", () => {
    expect(formatRelative(new Date("2026-08-13T02:00:00Z"), now)).toBe("3시간 전");
  });

  it("일 단위", () => {
    expect(formatRelative(new Date("2026-08-10T05:00:00Z"), now)).toBe("3일 전");
  });

  it("일주일이 넘으면 날짜로 떨어진다", () => {
    expect(formatRelative(new Date("2026-08-01T05:00:00Z"), now)).toBe("8/1");
  });

  it("미래 시각은 방금 전으로 뭉갠다 (시계 오차 방어)", () => {
    expect(formatRelative(new Date("2026-08-13T06:00:00Z"), now)).toBe("방금 전");
  });
});

describe("todayInKst", () => {
  it("UTC 로는 전날이어도 한국 기준 오늘을 준다", () => {
    expect(todayInKst(new Date("2026-08-12T15:30:00Z"))).toBe("2026-08-13");
  });
});
