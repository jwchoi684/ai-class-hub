"use client";

/**
 * 런타임 에러 화면.
 *
 * 기본 Next.js 에러 화면은 영어 스택 트레이스라 수업 중에 뜨면 수강생이
 * 무엇을 해야 할지 알 수 없습니다. 다시 시도할 방법과 막혔을 때 누구에게
 * 말해야 하는지까지 알려줍니다.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="text-xl font-bold tracking-tight">잠시 문제가 생겼어요</h1>
      <p className="max-w-sm text-sm text-muted">
        다시 시도해 보시고, 계속 안 되면 강사에게 알려주세요.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent"
      >
        다시 시도
      </button>
      {error.digest ? (
        <p className="font-mono text-[11px] text-faint">오류 코드 {error.digest}</p>
      ) : null}
    </main>
  );
}
