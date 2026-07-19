import QRCode from "qrcode";
import { getActiveAnnouncement } from "@/lib/db/announcements";
import { listSessions } from "@/lib/db/sessions";
import { pickCurrentSession } from "@/lib/current-session";
import { todayInKst } from "@/lib/datetime";
import { getBaseUrl, site } from "@/lib/site";
import { QrTargets } from "./qr-targets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 프로젝터용 QR 화면.
 *
 * 로그인이 없는 앱이라 이 화면이 사실상 로그인 화면 역할을 합니다 — 수업 시작
 * 때 강사가 띄우면 20명이 주소를 타이핑하지 않고 들어옵니다.
 *
 * QR 은 외부 생성 서비스를 쓰지 않고 서버에서 직접 그립니다. 외부 API 를 쓰면
 * 우리 주소가 제3자 로그에 남습니다 (docs/REQUIREMENTS.md §3).
 */
export default async function QrPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const { to } = await searchParams;
  const baseUrl = getBaseUrl();

  const [sessions, announcement] = await Promise.all([
    listSessions(false),
    getActiveAnnouncement(),
  ]);
  const current = pickCurrentSession(sessions, todayInKst());

  const targets = [
    { key: "home", label: "홈", path: "/" },
    ...(current
      ? [
          {
            key: "week",
            label: "이번 회차 자료",
            path: `/weeks/${current.orderNo}`,
          },
        ]
      : []),
    { key: "gallery", label: "갤러리", path: "/gallery" },
    { key: "new", label: "결과물 올리기", path: "/gallery/new" },
  ];

  const active = targets.find((target) => target.key === to) ?? targets[0]!;
  const url = `${baseUrl}${active.path === "/" ? "" : active.path}`;

  // 프로젝터에서도 또렷하도록 SVG 로 그립니다. 확대해도 깨지지 않습니다.
  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#171a18", light: "#ffffff" },
  });

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center">
      <p className="text-sm text-muted">
        <b className="font-bold text-ink">{site.className}</b>
        {current ? ` · ${current.orderNo}주차 ${current.title}` : ""}
      </p>

      <div
        className="w-[min(56vh,380px)] overflow-hidden rounded-xl bg-white p-3"
        // qrcode 패키지가 만든 SVG 문자열입니다. 사용자 입력이 들어가지 않습니다
        // — 주소는 서버가 자기 baseUrl 로 조립합니다.
        dangerouslySetInnerHTML={{ __html: svg }}
      />

      <p className="font-mono text-lg font-semibold tracking-tight break-all">
        {url.replace(/^https?:\/\//, "")}
      </p>

      {announcement ? (
        <p className="max-w-md rounded-lg bg-soft px-4 py-2 text-xs text-muted">
          📌 {announcement.body}
        </p>
      ) : null}

      <QrTargets targets={targets} activeKey={active.key} />
    </main>
  );
}
