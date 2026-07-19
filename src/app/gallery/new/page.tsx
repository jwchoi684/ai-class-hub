import { SiteHeader } from "@/components/site-header";
import { isAdmin } from "@/lib/auth/session";
import { listSessions } from "@/lib/db/sessions";
import { pickCurrentSession } from "@/lib/current-session";
import { todayInKst } from "@/lib/datetime";
import { PostForm } from "./post-form";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function NewPostPage() {
  const admin = await isAdmin();
  const sessions = await listSessions(false);
  const current = pickCurrentSession(sessions, todayInKst());

  return (
    <>
      <SiteHeader isAdmin={admin} />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-5 px-6 py-8">
        <h1 className="text-lg font-bold tracking-tight">결과물 올리기</h1>
        <PostForm
          sessions={sessions.map((session) => ({
            id: session.id,
            orderNo: session.orderNo,
            title: session.title,
          }))}
          defaultSessionId={current?.id ?? null}
        />
      </main>
    </>
  );
}
