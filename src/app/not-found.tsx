import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <p className="font-mono text-xs tracking-widest text-faint uppercase">404</p>
      <h1 className="text-xl font-bold tracking-tight">페이지를 찾을 수 없어요</h1>
      <p className="max-w-sm text-sm text-muted">
        주소가 바뀌었거나 삭제된 페이지일 수 있어요.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent"
      >
        홈으로
      </Link>
    </main>
  );
}
