/**
 * '이번 주차' 판정.
 *
 * 홈 화면 맨 위에서 가장 크게 보이는 카드라, 틀리면 수업 중에 바로 눈에 띕니다.
 * 반대로 조용히 틀려도 아무도 신고하지 않는 종류이기도 합니다 — 강사는 자기가
 * 아는 회차를 클릭해서 들어가니까요. 그래서 순수 함수로 떼어 테스트합니다.
 *
 * 규칙: **오늘까지 이미 열린 회차 중 가장 최근 것**.
 * 3주차 수업 당일 아침에도, 4주차 전날에도 3주차가 '이번 주차'입니다.
 * 수업 자료는 보통 그날 이후에도 며칠 더 들여다보기 때문입니다.
 *
 * 첫 수업 전이면 첫 회차를, 날짜가 하나도 없으면 번호가 가장 큰 회차를 씁니다.
 */

type DatedSession = {
  orderNo: number;
  heldOn: string | null;
};

export function pickCurrentSession<T extends DatedSession>(
  sessions: readonly T[],
  todayInKst: string,
): T | null {
  if (sessions.length === 0) return null;

  const dated = sessions.filter(
    (session): session is T & { heldOn: string } => session.heldOn !== null,
  );

  if (dated.length === 0) {
    // 날짜를 아직 안 넣은 상태. 번호가 가장 큰 회차가 최신일 가능성이 높습니다.
    return [...sessions].sort((a, b) => b.orderNo - a.orderNo)[0]!;
  }

  // 문자열 비교로 충분합니다 — YYYY-MM-DD 는 사전순이 곧 시간순입니다.
  const past = dated
    .filter((session) => session.heldOn <= todayInKst)
    .sort((a, b) => (a.heldOn < b.heldOn ? 1 : a.heldOn > b.heldOn ? -1 : b.orderNo - a.orderNo));

  if (past.length > 0) return past[0]!;

  // 아직 첫 수업 전. 가장 먼저 열리는 회차를 안내합니다.
  const upcoming = [...dated].sort((a, b) =>
    a.heldOn < b.heldOn ? -1 : a.heldOn > b.heldOn ? 1 : a.orderNo - b.orderNo,
  );

  return upcoming[0]!;
}
