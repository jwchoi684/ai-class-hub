import Link from "next/link";
import { site } from "@/lib/site";

/**
 * 공통 헤더.
 *
 * 강사와 수강생이 같은 주소로 들어오므로 헤더도 하나입니다.
 * 관리자 링크는 헤더 맨 끝에 작고 흐리게 둡니다 — 수강생이 누를 일은 없지만
 * 강사가 매번 주소를 타이핑하지 않아도 되게 하는 정도의 존재감입니다.
 */
export function SiteHeader({ isAdmin = false }: { isAdmin?: boolean }) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-4 px-6 py-3.5">
        <Link href="/" className="text-sm font-bold tracking-tight">
          {site.className}
        </Link>

        <span className="flex-1" />

        {isAdmin ? (
          <Link
            href="/admin"
            className="rounded-md bg-soft px-2.5 py-1 text-xs font-semibold text-accent"
          >
            관리자 모드
          </Link>
        ) : (
          <Link href="/admin" className="text-[11px] text-faint">
            관리자
          </Link>
        )}
      </div>
    </header>
  );
}
