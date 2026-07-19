import { db } from "@/lib/db/admin-client";
import { isAdmin } from "@/lib/auth/session";
import { describeDevice } from "@/lib/auth/device";
import { formatRelative } from "@/lib/datetime";
import {
  countsBySession,
  listSessions,
  suggestNextOrderNo,
} from "@/lib/db/sessions";
import { SiteHeader } from "@/components/site-header";
import { LoginForm } from "./login-form";
import { LogoutButtons } from "./logout-buttons";
import { SessionManager } from "./session-manager";
import { AnnouncementEditor } from "./announcement-editor";
import { getActiveAnnouncement } from "@/lib/db/announcements";

/** argon2 · Node 전용 모듈을 쓰므로 Edge 로 떨어지면 안 됩니다. */
export const runtime = "nodejs";
/** 세션 상태에 따라 화면이 갈리므로 캐시하면 안 됩니다. */
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdmin())) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <LoginForm />
      </main>
    );
  }

  const [{ data: sessions }, classSessions, counts, suggestedOrderNo] =
    await Promise.all([
      db()
        .from("admin_sessions")
        .select("id, created_at, last_seen_at, expires_at, user_agent")
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("last_seen_at", { ascending: false }),
      listSessions(true),
      countsBySession(),
      suggestNextOrderNo(),
    ]);

  const announcement = await getActiveAnnouncement();

  const active = sessions ?? [];

  const managed = classSessions.map((session) => ({
    ...session,
    materialCount: counts[session.id]?.materials ?? 0,
    postCount: counts[session.id]?.posts ?? 0,
  }));

  return (
    <>
    <SiteHeader isAdmin />
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
      <div className="flex items-center gap-2 rounded-lg bg-soft px-4 py-2.5">
        <span className="text-sm font-semibold text-accent">● 관리자 모드 ON</span>
        <span className="text-xs text-muted">
          사이트 전체에서 편집 컨트롤이 보입니다
        </span>
      </div>

      <AnnouncementEditor
        initialBody={announcement?.body ?? ""}
        initialLink={announcement?.linkUrl ?? ""}
      />

      <SessionManager sessions={managed} suggestedOrderNo={suggestedOrderNo} />

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-bold tracking-tight">로그인된 기기</h2>
          <p className="text-xs text-muted">
            강의실이나 프로젝터에 연결된 PC 에서 로그인했다면 여기서 끊을 수 있어요.
            비밀번호를 바꿔도 모든 기기가 자동으로 로그아웃됩니다.
          </p>
        </div>

        <ul className="flex flex-col divide-y divide-line">
          {active.map((session) => (
            <li
              key={session.id}
              className="flex items-baseline justify-between gap-3 py-2"
            >
              <span className="truncate text-xs text-muted">
                {describeDevice(session.user_agent)}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-faint">
                {formatRelative(new Date(session.last_seen_at))}
              </span>
            </li>
          ))}
        </ul>

        <LogoutButtons activeSessions={active.length} />
      </section>

      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-5">
        <span className="flex flex-1 flex-col gap-0.5">
          <b className="text-sm font-bold tracking-tight">QR 접속 화면</b>
          <span className="text-xs text-muted">
            수업 시작 때 프로젝터에 띄우면 수강생이 주소를 치지 않고 들어옵니다.
          </span>
        </span>
        <a
          href="/qr"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent"
        >
          QR 화면 열기 ↗
        </a>
      </section>
    </main>
    </>
  );
}
