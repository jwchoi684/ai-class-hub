import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase 접근 지점 — 이 파일이 유일합니다.
 *
 * 이 앱은 브라우저에 anon key 를 내려보내지 않습니다. 읽기든 쓰기든 전부 서버
 * 라우트를 거치고, 서버는 RLS 를 우회하는 service_role 키를 씁니다
 * (docs/REQUIREMENTS.md §2.2).
 *
 * 왜 RLS 로 안 푸는가: 로그인이 없어서 모든 방문자가 동일한 anon role 입니다.
 * "운영자만 업로드"와 "PIN 을 아는 사람만 수정"은 RLS 의 표현 범위 밖이고,
 * RLS 로는 '누구나 쓰기' 아니면 '아무도 못 씀' 둘 중 하나밖에 못 만듭니다.
 *
 * 대가는 이 키가 전권이라는 것입니다. 그래서 —
 *  - `import "server-only"` 를 맨 위에 둡니다. 클라이언트 컴포넌트에서
 *    실수로 import 하면 런타임이 아니라 **빌드가 실패**합니다.
 *  - 환경변수 이름에 NEXT_PUBLIC_ 을 절대 쓰지 않습니다. 그 접두사가 붙는
 *    순간 값이 번들에 인라인돼 누구나 전체 데이터를 지울 수 있습니다.
 *  - 이 키를 쓰는 코드에서 임의 URL 을 fetch 하지 않습니다. SSRF 방어가
 *    위생 문제가 아니라 키 보호의 일부입니다.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    // 빌드 타임이 아니라 첫 요청에서 터지므로, 무엇을 어디에 넣어야 하는지까지
    // 알려줍니다. "undefined is not a string" 을 디버깅하는 것보다 낫습니다.
    throw new Error(
      `환경변수 ${name} 가 없습니다. 로컬은 .env.local, 배포는 Vercel 의 ` +
        `Settings → Environment Variables 에 넣으세요. (.env.example 참고)`,
    );
  }
  return value;
}

/**
 * 서버용 키를 읽습니다.
 *
 * Supabase 가 키 체계를 바꿨습니다:
 *   legacy `service_role`(JWT) → 새 `sb_secret_...`
 *   legacy `anon`             → 새 `sb_publishable_...`
 *
 * 이 앱은 브라우저에 Supabase 키를 내려보내지 않으므로 publishable 쪽은
 * 아예 필요가 없고, 서버용 키 하나만 씁니다.
 *
 * 두 이름을 모두 받습니다. 새 이름을 먼저 보되, 예전 이름으로 설정된 환경도
 * 그대로 뜨게 해서 키를 교체하는 동안 배포가 멈추지 않게 합니다.
 * (레거시 키는 2026년 말까지 동작합니다.)
 */
function serverKey(): string {
  const value =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!value) {
    throw new Error(
      "환경변수 SUPABASE_SECRET_KEY 가 없습니다. Supabase 대시보드 → " +
        "Settings → API Keys → 'Publishable and secret API keys' 탭에서 " +
        "secret key(sb_secret_…)를 복사해 넣으세요. " +
        "로컬은 .env.local, 배포는 Vercel 의 Environment Variables 입니다.",
    );
  }

  /*
   * publishable 키를 잘못 넣으면 RLS 전면 거부에 걸려 "왜 아무것도 안 보이지"
   * 로 한참 헤매게 됩니다. 형태만 봐도 알 수 있으니 시작할 때 바로 잡습니다.
   */
  if (value.startsWith("sb_publishable_")) {
    throw new Error(
      "SUPABASE_SECRET_KEY 에 publishable 키가 들어 있습니다. " +
        "이 키는 브라우저용이라 서버에서 쓰면 아무 데이터도 읽지 못합니다. " +
        "secret key(sb_secret_…)로 바꿔주세요.",
    );
  }

  return value;
}

let cached: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (cached) return cached;

  cached = createClient(
    requireEnv("SUPABASE_URL"),
    serverKey(),
    {
      auth: {
        // 서버 전용이라 세션을 유지하거나 갱신할 대상이 없습니다. 켜 두면
        // 서버리스 인스턴스마다 불필요한 타이머와 저장소 접근이 생깁니다.
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  return cached;
}
