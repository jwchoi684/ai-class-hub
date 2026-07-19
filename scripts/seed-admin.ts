/**
 * 운영자 비밀번호 최초 설정 — `pnpm seed:admin`
 *
 * 이게 없으면 admin_credential 테이블이 비어 있어 /admin 을 통과할 수 없고,
 * 통과하지 못하면 회차도 자료도 만들 수 없습니다. 즉 배포에 성공해도 앱을
 * 쓸 수 없는 상태로 시작합니다.
 *
 * 사용법
 *   pnpm seed:admin                 비밀번호를 생성해서 화면에 1회만 출력
 *   pnpm seed:admin --reset         이미 설정돼 있어도 새 비밀번호로 교체
 *
 * 비밀번호를 잊었을 때
 *   같은 명령을 --reset 과 함께 다시 돌리면 됩니다. password_version 이
 *   올라가면서 기존 세션(강의실 PC 등)도 전부 무효가 됩니다.
 */
import { createClient } from "@supabase/supabase-js";
import { hashSecret } from "../src/lib/auth/hash";
import { generatePassword } from "../src/lib/auth/password";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`\n  환경변수 ${name} 가 없습니다.`);
    console.error(`  .env.local 을 만들고 채우세요. (.env.example 참고)\n`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const reset = process.argv.includes("--reset");

  const supabase = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  requireEnv("ADMIN_PEPPER");

  const { data: existing, error: readError } = await supabase
    .from("admin_credential")
    .select("id, password_version, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (readError) {
    console.error(`\n  DB 조회에 실패했습니다: ${readError.message}`);
    console.error(`  마이그레이션을 먼저 적용했는지 확인하세요.\n`);
    process.exit(1);
  }

  if (existing && !reset) {
    console.log(`\n  운영자 비밀번호가 이미 설정돼 있습니다.`);
    console.log(`  (버전 ${existing.password_version}, 마지막 변경 ${existing.updated_at})`);
    console.log(`\n  새 비밀번호로 바꾸려면:  pnpm seed:admin --reset\n`);
    return;
  }

  const password = generatePassword();
  const passwordHash = await hashSecret(password);

  // password_version 을 올리면 기존 세션이 전부 무효가 됩니다. 강의실이나
  // 프로젝터 PC 에 남은 로그인을 끊는 수단이기도 합니다.
  const nextVersion = (existing?.password_version ?? 0) + 1;

  const { error: writeError } = await supabase
    .from("admin_credential")
    .upsert(
      {
        id: 1,
        password_hash: passwordHash,
        algo: "argon2id",
        password_version: nextVersion,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (writeError) {
    console.error(`\n  저장에 실패했습니다: ${writeError.message}\n`);
    process.exit(1);
  }

  if (reset && existing) {
    const { error: revokeError } = await supabase
      .from("admin_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .is("revoked_at", null);

    if (revokeError) {
      console.error(`\n  경고: 기존 세션 폐기에 실패했습니다: ${revokeError.message}`);
      console.error(`  password_version 이 올라갔으므로 검증 단계에서는 막힙니다.\n`);
    }
  }

  // 비밀번호는 여기서만 평문으로 존재합니다. DB 에도 로그에도 남지 않습니다.
  console.log(`
  ┌─────────────────────────────────────────────────┐
  │  운영자 비밀번호가 설정됐습니다                 │
  └─────────────────────────────────────────────────┘

      ${password}

  이 값은 지금 이 화면에만 나옵니다. DB 에는 해시만 저장됩니다.

  1. 지금 비밀번호 관리자에 저장하세요.
  2. 강의실이나 프로젝터에 연결된 PC 에서는 입력하지 마세요.
     보고 있는 사람 중 누군가는 기억합니다.
  3. 잊었다면 다시:  pnpm seed:admin --reset
`);

  if (reset && existing) {
    console.log(`  기존 로그인 세션은 모두 끊겼습니다. 다시 로그인해야 합니다.\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
