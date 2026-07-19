"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, remember }),
      });

      if (response.ok) {
        setPassword("");
        // 서버 컴포넌트를 다시 그려 관리자 화면으로 전환합니다.
        router.refresh();
        return;
      }

      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(data?.error ?? "로그인에 실패했어요. 잠시 후 다시 시도해주세요.");
    } catch {
      setError("연결에 실패했어요. 네트워크를 확인해주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-line bg-surface p-6"
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-base font-bold tracking-tight">운영자 확인</h1>
        <p className="text-xs text-muted">
          강의 자료와 회차를 관리하려면 비밀번호가 필요해요.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted">비밀번호</span>
        <input
          type="password"
          name="admin-password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoFocus
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>

      <label className="flex items-start gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
          className="mt-0.5 accent-accent"
        />
        {/*
          라벨에 경고를 같이 씁니다. 이 앱에서 가장 현실적인 유출 경로는
          해킹이 아니라 강의실 화면에 비밀번호를 타이핑하는 순간이라,
          체크박스 옆이 그 말을 할 수 있는 유일한 자리입니다.
        */}
        <span>
          이 기기를 30일 기억
          <span className="block text-faint">
            강의실·공용 PC 에서는 체크하지 마세요.
          </span>
        </span>
      </label>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || password.length === 0}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50"
      >
        {pending ? "확인 중…" : "확인"}
      </button>
    </form>
  );
}
