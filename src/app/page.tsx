import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { getActiveAnnouncement } from "@/lib/db/announcements";
import { isAdmin } from "@/lib/auth/session";
import { listSessions, type ClassSession } from "@/lib/db/sessions";
import { pickCurrentSession } from "@/lib/current-session";
import { formatClassDate, todayInKst } from "@/lib/datetime";

/** 세션 상태에 따라 보이는 내용이 달라지므로 캐시하지 않습니다. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Home() {
  const admin = await isAdmin();
  const [sessions, announcement] = await Promise.all([
    listSessions(admin),
    getActiveAnnouncement(),
  ]);
  const current = pickCurrentSession(sessions, todayInKst());

  return (
    <>
      <AnnouncementBanner announcement={announcement} />
      <SiteHeader isAdmin={admin} />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-8">
        {sessions.length === 0 ? (
          <EmptyState isAdmin={admin} />
        ) : (
          <>
            {current ? <CurrentWeekCard session={current} /> : null}

            <section className="flex flex-col gap-3">
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-bold tracking-tight">전체 회차</h2>
                <span className="font-mono text-[11px] text-faint">
                  {sessions.length}
                </span>
              </div>

              <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {sessions.map((session) => (
                  <li key={session.id}>
                    <WeekCard session={session} />
                  </li>
                ))}
                {admin ? (
                  <li>
                    <Link
                      href="/admin"
                      className="flex h-full min-h-[92px] items-center justify-center rounded-xl border border-dashed border-line-strong text-xs text-faint"
                    >
                      ＋ 새 회차 추가
                    </Link>
                  </li>
                ) : null}
              </ul>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function CurrentWeekCard({ session }: { session: ClassSession }) {
  return (
    <Link
      href={`/weeks/${session.orderNo}`}
      className="flex items-center gap-5 rounded-xl border border-line bg-surface-2 p-5"
    >
      <span className="font-mono text-3xl font-bold leading-none tracking-tight text-accent">
        {String(session.orderNo).padStart(2, "0")}
      </span>

      <span className="flex flex-1 flex-col gap-0.5">
        <span className="font-mono text-[10px] font-semibold tracking-widest text-accent uppercase">
          이번 주차
        </span>
        <span className="text-base font-bold tracking-tight">
          {session.title}
        </span>
        {session.description ? (
          <span className="line-clamp-2 text-xs text-muted">
            {session.description}
          </span>
        ) : null}
      </span>

      <span className="hidden shrink-0 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent sm:block">
        자료 보러가기 →
      </span>
    </Link>
  );
}

function WeekCard({ session }: { session: ClassSession }) {
  return (
    <Link
      href={`/weeks/${session.orderNo}`}
      className={`flex h-full flex-col gap-1 rounded-xl border border-line bg-surface p-3.5 ${
        session.isPublished ? "" : "border-dashed opacity-60"
      }`}
    >
      <span className="font-mono text-[11px] font-semibold text-faint">
        {String(session.orderNo).padStart(2, "0")}
      </span>
      <span className="text-[13px] leading-snug font-semibold tracking-tight">
        {session.title}
      </span>
      <span className="mt-auto pt-1 font-mono text-[11px] text-faint">
        {session.heldOn ? formatClassDate(session.heldOn) : "날짜 미정"}
        {session.isPublished ? "" : " · 준비 중"}
      </span>
    </Link>
  );
}

function EmptyState({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
      <p className="text-sm font-semibold">아직 열린 회차가 없어요</p>
      <p className="max-w-xs text-xs text-muted">
        {isAdmin
          ? "관리자 화면에서 첫 회차를 만들면 여기에 표시됩니다."
          : "첫 수업 전에 강사가 자료를 올릴 거예요."}
      </p>
      {isAdmin ? (
        <Link
          href="/admin"
          className="mt-1 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent"
        >
          회차 만들기
        </Link>
      ) : null}
    </div>
  );
}
