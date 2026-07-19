/**
 * 날짜·시간 포매팅 — 전부 한국 시간(KST) 기준.
 *
 * Vercel 서버 런타임은 UTC 입니다. 포매팅에 시간대를 고정하지 않으면 밤 9시
 * 이후에 올라온 게시물의 날짜가 하루 밀려 보입니다(UTC 로는 아직 어제라서).
 * 그래서 날짜를 화면에 찍는 경로는 예외 없이 이 모듈을 거칩니다.
 */

export const TIME_ZONE = "Asia/Seoul";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** KST 기준으로 연/월/일/요일을 분해합니다. */
function partsInKst(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));

  // Date.getUTCDay 로 요일을 구하면 UTC 기준이라 밀릴 수 있어, KST 로 환산한
  // 연·월·일을 UTC 자정으로 다시 만들어 요일을 뽑습니다.
  const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return { year, month, day, weekday: WEEKDAYS[weekdayIndex] };
}

/**
 * `YYYY-MM-DD` 문자열(Postgres `date` 컬럼)을 분해합니다.
 *
 * 이런 값은 시간대가 없는 '달력 날짜'입니다. Date 로 파싱하면 UTC 자정으로
 * 해석돼 KST 로 환산할 때 하루가 밀리므로, 문자열을 그대로 씁니다.
 */
function partsFromDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, weekday: WEEKDAYS[weekdayIndex] };
}

/** 회차 날짜 등 `date` 컬럼용. → `8/12(화)` */
export function formatClassDate(dateOnly: string): string {
  const { month, day, weekday } = partsFromDateOnly(dateOnly);
  return `${month}/${day}(${weekday})`;
}

/** 회차 상세 헤더용. → `2026년 8월 12일 (화)` */
export function formatClassDateLong(dateOnly: string): string {
  const { year, month, day, weekday } = partsFromDateOnly(dateOnly);
  return `${year}년 ${month}월 ${day}일 (${weekday})`;
}

/** 게시물 작성일 등 `timestamptz` 컬럼용. → `8/13` */
export function formatDate(date: Date): string {
  const { month, day } = partsInKst(date);
  return `${month}/${day}`;
}

/** 관리 화면 표용. → `2026-08-13` */
export function formatDateIso(date: Date): string {
  const { year, month, day } = partsInKst(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * 댓글·게시물의 상대 시간. → `방금 전` / `3분 전` / `2시간 전` / `3일 전`
 * 일주일이 넘으면 날짜로 떨어집니다 — "37일 전"은 읽어도 감이 안 옵니다.
 */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();

  // 시계 오차나 서버-클라이언트 차이로 미래가 나오면 '방금 전'으로 뭉갭니다.
  if (diffMs < 0) return "방금 전";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(hours / 24);
  if (days <= 7) return `${days}일 전`;

  return formatDate(date);
}

/** KST 기준 오늘 날짜. '이번 주차' 판정에 씁니다. → `2026-08-12` */
export function todayInKst(now: Date = new Date()): string {
  return formatDateIso(now);
}
