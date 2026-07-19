/**
 * 사이트 전역 설정.
 *
 * 지금은 상수지만, 클래스명·QR 기준 주소는 나중에 site_settings 테이블로 옮겨
 * /admin 에서 재배포 없이 고칠 수 있게 할 예정입니다 (docs/REQUIREMENTS.md §4).
 * 그때까지는 여기 한 곳만 고치면 됩니다.
 */
export const site = {
  /** 헤더 로고와 QR 화면 상단에 표시되는 이름 */
  className: "AI 실전 클래스",
  /** 브라우저 탭 제목 */
  title: "AI 실전 클래스",
  description: "수업 자료와 수강생 결과물을 한곳에서 공유합니다.",
} as const;

/**
 * 배포된 사이트의 정규 주소. QR 코드가 가리킬 대상이라 반드시 실제 주소여야 합니다.
 *
 * Vercel 은 프로덕션 도메인을 VERCEL_PROJECT_PRODUCTION_URL 로 주입합니다
 * (프리뷰 배포에서도 프로덕션 도메인을 가리키므로 QR 대상으로 안전합니다).
 * 로컬에서는 localhost 로 떨어집니다.
 */
export function getBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
