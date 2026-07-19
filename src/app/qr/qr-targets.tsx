"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * QR 이 가리킬 대상 전환.
 *
 * 수업 흐름에 맞춰 바꿉니다 — 시작할 땐 홈, 자료 볼 땐 회차, 실습 끝나면
 * '결과물 올리기'. 숫자 키로도 바꿀 수 있게 한 이유는 강사가 프로젝터 앞에서
 * 마우스를 찾지 않아도 되게 하려는 것입니다.
 */
export function QrTargets({
  targets,
  activeKey,
}: {
  targets: { key: string; label: string; path: string }[];
  activeKey: string;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "f" || event.key === "F") {
        void document.documentElement.requestFullscreen?.().catch(() => {});
        return;
      }

      const index = Number(event.key) - 1;
      const target = targets[index];
      if (target) {
        window.location.href = `/qr?to=${target.key}`;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [targets]);

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {targets.map((target, index) => (
        <Link
          key={target.key}
          href={`/qr?to=${target.key}`}
          className={`rounded-full border px-3 py-1 text-xs ${
            target.key === activeKey
              ? "border-accent bg-accent text-on-accent font-semibold"
              : "border-line text-muted"
          }`}
        >
          <span className="mr-1 font-mono text-[10px] opacity-60">
            {index + 1}
          </span>
          {target.label}
        </Link>
      ))}
      <span className="ml-2 font-mono text-[10px] text-faint">F 전체화면</span>
    </div>
  );
}
