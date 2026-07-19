import { db } from "@/lib/db/admin-client";
import { isAdmin } from "@/lib/auth/session";
import { describeDevice } from "@/lib/auth/device";
import { formatRelative } from "@/lib/datetime";
import { LoginForm } from "./login-form";
import { LogoutButtons } from "./logout-buttons";

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

  const { data: sessions } = await db()
    .from("admin_sessions")
    .select("id, created_at, last_seen_at, expires_at, user_agent")
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("last_seen_at", { ascending: false });

  const active = sessions ?? [];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center gap-2 rounded-lg bg-soft px-4 py-2.5">
        <span className="text-sm font-semibold text-accent">● 관리자 모드 ON</span>
      </div>

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

      <section className="rounded-xl border border-dashed border-line p-5">
        <p className="text-xs text-muted">
          회차 관리와 공지 편집은 다음 단계에서 여기에 붙습니다.
        </p>
      </section>
    </main>
  );
}
