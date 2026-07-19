import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { getActiveAnnouncement } from "@/lib/db/announcements";
import { isAdmin } from "@/lib/auth/session";
import { getSessionByOrderNo, listSessions } from "@/lib/db/sessions";
import { formatBytes, listMaterials } from "@/lib/db/materials";
import { displayHost } from "@/lib/net/url-safety";
import { formatClassDateLong } from "@/lib/datetime";
import { Materials, type MaterialView } from "./materials";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function WeekPage({
  params,
}: {
  params: Promise<{ orderNo: string }>;
}) {
  const { orderNo: raw } = await params;

  /*
   * 주소를 정수로만 받습니다. '3.0' 이나 '03' 같은 변형을 허용하면 같은 회차가
   * 여러 주소를 갖게 되고, 나중에 공유된 링크가 어느 쪽인지 알 수 없어집니다.
   */
  if (!/^[1-9]\d{0,2}$/.test(raw)) notFound();
  const orderNo = Number(raw);

  const admin = await isAdmin();
  const lookup = await getSessionByOrderNo(orderNo, admin);

  if (lookup.status === "not_found") notFound();

  if (lookup.status === "deleted") {
    return (
      <>
        <SiteHeader isAdmin={admin} />
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
          <h1 className="text-lg font-bold tracking-tight">
            삭제된 회차예요
          </h1>
          {/* 404 와 구분합니다 — 단톡방 링크를 누른 사람이 자기가 주소를
              잘못 눌렀다고 오해하지 않게. */}
          <p className="max-w-xs text-xs text-muted">
            {orderNo}주차는 더 이상 열려 있지 않아요. 다른 회차를 확인해보세요.
          </p>
          <Link
            href="/"
            className="mt-1 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent"
          >
            전체 회차 보기
          </Link>
        </main>
      </>
    );
  }

  const { session } = lookup;
  const [siblings, materials, announcement] = await Promise.all([
    listSessions(admin),
    listMaterials(session.id),
    getActiveAnnouncement(),
  ]);

  const materialViews: MaterialView[] = materials.map((material) => ({
    id: material.id,
    kind: material.kind,
    title: material.title,
    description: material.description,
    href: material.href,
    subtitle:
      material.kind === "link"
        ? displayHost(material.href)
        : [material.file?.name, formatBytes(material.file?.sizeBytes ?? null)]
            .filter(Boolean)
            .join(" · "),
  }));

  const index = siblings.findIndex((item) => item.id === session.id);
  const previous = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;

  return (
    <>
      <AnnouncementBanner announcement={announcement} />
      <SiteHeader isAdmin={admin} />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-7 px-6 py-8">
        <div className="flex flex-col gap-2">
          <Link href="/" className="font-mono text-[11px] text-faint">
            ← 전체 회차
          </Link>

          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="text-xl font-bold tracking-tight">
              {session.orderNo}주차 · {session.title}
            </h1>
            {!session.isPublished ? (
              <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold text-muted">
                준비 중
              </span>
            ) : null}
          </div>

          <p className="text-xs text-muted">
            {session.heldOn ? formatClassDateLong(session.heldOn) : "날짜 미정"}
            {session.description ? ` · ${session.description}` : ""}
          </p>
        </div>

        <Materials
          sessionId={session.id}
          orderNo={session.orderNo}
          materials={materialViews}
          isAdmin={admin}
        />

        {previous || next ? (
          <nav className="flex items-center justify-between gap-3 border-t border-line pt-4">
            {previous ? (
              <Link
                href={`/weeks/${previous.orderNo}`}
                className="max-w-[45%] truncate text-xs text-muted"
              >
                ← {previous.orderNo}주차 {previous.title}
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                href={`/weeks/${next.orderNo}`}
                className="max-w-[45%] truncate text-right text-xs text-muted"
              >
                {next.orderNo}주차 {next.title} →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </main>
    </>
  );
}
