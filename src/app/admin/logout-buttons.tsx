"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButtons({ activeSessions }: { activeSessions: number }) {
  const router = useRouter();
  const [pending, setPending] = useState<"this" | "all" | null>(null);

  async function end(scope: "this" | "all") {
    if (pending) return;
    if (
      scope === "all" &&
      !confirm(
        `로그인된 기기 ${activeSessions}곳이 모두 로그아웃됩니다. 계속할까요?`,
      )
    ) {
      return;
    }

    setPending(scope);
    try {
      await fetch(
        `/api/admin/session${scope === "all" ? "?scope=everywhere" : ""}`,
        { method: "DELETE" },
      );
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => end("this")}
        disabled={pending !== null}
        className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
      >
        {pending === "this" ? "로그아웃 중…" : "이 기기 로그아웃"}
      </button>

      <button
        type="button"
        onClick={() => end("all")}
        disabled={pending !== null}
        className="rounded-lg border border-danger px-3 py-1.5 text-xs font-semibold text-danger disabled:opacity-50"
      >
        {pending === "all" ? "로그아웃 중…" : "모든 기기 로그아웃"}
      </button>
    </div>
  );
}
