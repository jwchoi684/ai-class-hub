import type { Announcement } from "@/lib/db/announcements";

/**
 * 상단 고정 공지.
 *
 * 닫기 버튼을 두지 않았습니다. 목업에는 있었지만, 실제로 여기 걸리는 내용은
 * "다음 수업 준비물"처럼 안 보면 곤란한 것들입니다. 한 번 닫으면 그 뒤로
 * 안 보이는 배너는 준비물 안내에 쓸 수 없습니다.
 * 대신 한 줄로 짧게 유지되도록 500자 제한을 걸어 두었습니다.
 */
export function AnnouncementBanner({
  announcement,
}: {
  announcement: Announcement | null;
}) {
  if (!announcement) return null;

  const content = (
    <>
      <span aria-hidden className="text-accent">
        📌
      </span>
      <span className="min-w-0 flex-1">{announcement.body}</span>
      {announcement.linkUrl ? (
        <span className="shrink-0 font-semibold text-accent">자세히 →</span>
      ) : null}
    </>
  );

  const className =
    "flex items-center gap-2.5 bg-soft px-6 py-2.5 text-[13px] leading-relaxed text-ink";

  return announcement.linkUrl ? (
    <a
      href={announcement.linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  );
}
