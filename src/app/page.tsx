import { site } from "@/lib/site";

/**
 * 임시 홈 — 구현 1단계(배포 파이프라인 확보)의 자리 표시자입니다.
 * 4단계에서 회차 목록으로, 이후 공지 배너와 최근 결과물이 붙습니다.
 */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-5 px-6 py-24">
      <p className="font-mono text-[11px] font-semibold tracking-widest text-accent uppercase">
        준비 중
      </p>

      <h1 className="text-2xl font-bold tracking-tight">{site.className}</h1>

      <p className="text-sm leading-relaxed text-muted">
        수업 자료와 결과물 공유 공간을 만들고 있어요. 첫 수업 전에 열립니다.
      </p>

      <div className="mt-2 rounded-xl border border-line bg-surface p-4">
        <p className="text-xs font-semibold text-muted">여기서 하게 될 것</p>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm text-muted">
          <li>· 회차별 강의 자료 보기 · 내려받기</li>
          <li>· 내가 만든 웹사이트·작업물 올리기</li>
          <li>· 다른 사람 결과물 구경하고 반응 남기기</li>
        </ul>
      </div>
    </main>
  );
}
