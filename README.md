# AI 수업 허브

오프라인 AI 수업의 강의 자료와 수강생 결과물을 공유하는 웹앱.

- **[docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)** — 요구사항 정의서. 설계 결정의 근거는 전부 여기 있습니다.
- **[docs/mockups.html](docs/mockups.html)** — 전체 화면 목업. 브라우저로 바로 열립니다.

## 시작하기

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

## 검증

```bash
pnpm verify       # typecheck + lint + 유닛 + e2e 를 한 번에
```

개별 실행:

| 명령 | 내용 |
|---|---|
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest 유닛 테스트 (TZ=UTC 로 고정) |
| `pnpm e2e` | Playwright — 데스크톱 Chrome + iPhone WebKit |

e2e 는 프로덕션 빌드를 대상으로 돌립니다. dev 서버에서만 통과하는 테스트는 배포 후 처음 깨지는 종류라 신뢰할 수 없기 때문입니다.

최초 1회 브라우저 설치가 필요합니다:

```bash
pnpm exec playwright install chromium webkit
```

## 배포

| | |
|---|---|
| 프로덕션 | https://ai-class-hub-virid.vercel.app |
| 정식 도메인 | `ai-class-hub-jayjaewoongchoi-2571s-projects.vercel.app` |
| Vercel 프로젝트 | `ai-class-hub` (Hobby) |
| 함수 리전 | `icn1` (서울) — `vercel.json` |
| Supabase | `ai-class-hub` · `ap-northeast-2` (서울) |
| Supabase URL | `https://renciczylvkznbqpetrt.supabase.co` |

함수 리전을 서울로 고정한 이유: Supabase 가 서울에 있는데 함수가 기본값인 버지니아(`iad1`)에서 돌면 DB 쿼리마다 태평양을 왕복합니다.

저장소: https://github.com/jwchoi684/ai-class-hub (public)

**Vercel ↔ GitHub 연동은 아직입니다.** 현재 배포는 파일을 직접 올린 것이라 `main` 에 푸시해도 자동 배포되지 않습니다. Vercel 대시보드 → `ai-class-hub` → Settings → Git 에서 이 저장소를 연결하면 그때부터 푸시가 곧 배포가 됩니다.

**공개 저장소라는 점을 기억하세요.** 비밀값은 전부 `.env.local`(gitignore)과 Vercel 환경변수에만 있고 커밋 히스토리에도 없지만, 앞으로 코드에 키·비밀번호를 적지 않도록 주의가 필요합니다.

## 데이터베이스

마이그레이션은 `supabase/migrations/` 에 있고 순서대로 적용합니다.

### 로컬 개발

Docker 가 떠 있어야 합니다.

```bash
pnpm supabase:start   # 로컬 Supabase 스택 (첫 실행은 이미지 내려받느라 몇 분)
pnpm db:reset         # 마이그레이션을 처음부터 다시 적용
pnpm supabase:stop    # 정리
```

`.env.local` 의 기본값은 **로컬 스택**입니다. 거기 적힌 두 키는 Supabase CLI 가
모두에게 똑같이 주는 공개된 개발용 값이라 비밀이 아닙니다.
프로덕션 DB 를 직접 보려면 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 만
프로덕션 값으로 바꾸세요(대시보드 → Project Settings → API → `service_role`).
프로덕션 키는 저장소에 커밋하지 않습니다.

> **로컬 스택이 프로덕션이 숨기는 버그를 잡습니다.**
> 호스팅 Supabase 는 새 테이블에 `service_role` 전 권한을 자동으로 주지만
> 로컬 CLI 스택은 `SELECT` 조차 주지 않습니다. 그래서 프로덕션에서는 멀쩡하던
> 마이그레이션이 로컬에서는 PostgREST 42501 로 전부 실패했습니다
> (앱은 엉뚱하게 "비밀번호가 설정되지 않았어요"를 띄웁니다).
> 지금은 `0004` 가 필요한 권한을 **명시적으로** 부여하므로 어느 환경이든 같게 동작합니다.
> 새 마이그레이션을 쓸 때도 호스트의 기본 권한에 기대지 마세요.

```bash
pnpm seed:admin            # 운영자 비밀번호 최초 생성 (평문은 화면에 1회만)
pnpm seed:admin --reset    # 잊었을 때. 기존 세션도 전부 끊깁니다
```

> **ADMIN_PEPPER 는 해시와 한 쌍입니다.**
> 비밀번호 해시는 `argon2id(HMAC(ADMIN_PEPPER, 비밀번호))` 로 저장됩니다.
> 페퍼가 다르면 **맞는 비밀번호를 넣어도 로그인이 안 됩니다.**
> 그래서 `.env.local` 의 `ADMIN_PEPPER` 와 Vercel 환경변수의 값이 **반드시 같아야** 합니다.
> 페퍼를 잃어버리면 비밀번호를 복구할 방법이 없고 `pnpm seed:admin --reset` 으로 다시 만들어야 합니다.
> (이게 페퍼의 존재 이유이기도 합니다 — DB 덤프만 유출돼도 오프라인 크래킹이 불가능합니다.)

핵심 규칙 세 가지:

**anon key 를 브라우저에 내려보내지 않습니다.** 모든 읽기·쓰기가 서버를 거치고 `service_role` 을 씁니다. 로그인이 없어서 모든 방문자가 같은 `anon` role 이라, "운영자만"과 "PIN 을 아는 사람만"은 RLS 로 표현할 수 없기 때문입니다. 전 테이블에 RLS 를 켜고 정책은 0개(전면 거부) — 나중에 누가 클라이언트에서 supabase-js 를 쓰더라도 아무것도 읽히지 않게 하는 안전망입니다. 여기에 더해 `anon` 의 테이블 권한을 명시적으로 회수했습니다.

**아무것도 물리 삭제하지 않습니다.** 무료 플랜에는 복원 가능한 백업이 없어서 잘못 누른 삭제가 곧 영구 손실입니다. FK 는 `ON DELETE RESTRICT`, 삭제는 전부 `deleted_at`. 예외는 두 가지 — 반응 취소, 그리고 삭제 요청 시 이미지 파일 자체(화면에서만 사라지면 "지워주세요"의 의미가 없으므로).

**공개 쓰기 경로에는 길이 제한이 걸려 있습니다.** 로그인이 없어 주소만 알면 누구나 게시 라우트를 호출합니다. 제한이 없으면 스크립트로 무료 DB 를 채울 수 있고, 소프트 삭제라 공간도 회수되지 않습니다.

## 기술 스택

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (Postgres 17) · Vitest · Playwright · Vercel

## 구조

```
src/
  app/          라우트. layout / page / not-found / error / robots
  components/   공통 UI (헤더 등)
  lib/
    site.ts     사이트 설정과 배포 주소 (→ 나중에 site_settings 테이블)
    datetime.ts 모든 날짜 포매팅. 전부 KST 고정
e2e/            Playwright 스펙
docs/           요구사항 정의서 + 화면 목업
```

## 알아둘 것

**검색엔진 색인은 기본 차단입니다.** `next.config.ts` 의 `X-Robots-Tag` 헤더, `layout.tsx` 의 robots 메타태그, `robots.ts` 세 군데에 걸려 있습니다. 로그인이 없는 사이트라 주소가 퍼지는 건 시간 문제이고, 한 번 색인되면 되돌릴 수 없기 때문입니다. 공개로 바꾸려면 세 곳을 함께 지우면 됩니다.

**날짜는 반드시 `src/lib/datetime.ts` 를 거칩니다.** 서버 런타임이 UTC 라 시간대를 고정하지 않으면 밤 9시 이후 게시물의 날짜가 하루 밀립니다. 유닛 테스트가 `TZ=UTC` 로 돌아가므로 시간대를 빠뜨린 구현은 테스트에서 잡힙니다.

**웹폰트를 쓰지 않습니다.** 한글 웹폰트는 수 MB인데, 강의실 와이파이에서 20명이 동시 접속하는 게 기본 시나리오입니다. 시스템 한글 폰트로 충분합니다.

## 진행 상황

구현 순서는 [docs/REQUIREMENTS.md §7](docs/REQUIREMENTS.md) 기준입니다.

- [x] 1. 배포 파이프라인 + 앱 셸 + 색인 차단 + 한국어 에러 화면 + 테스트 하네스
- [x] 2. 관리자 시드 스크립트 (`pnpm seed:admin`)
- [x] 3. 데이터 모델 — 13개 테이블 + 공개 뷰. Storage 버킷은 6단계에서 함께
- [x] 4. 운영자 비밀번호 게이트 (`/admin`)
- [x] 5. 회차 생성 + 목록/상세 (`/`, `/weeks/[번호]`, `/admin`)
- [ ] 6. 자료 업로드 + 링크 등록
- [ ] 7. 갤러리 게시 + 카드 그리드 + PIN 삭제
- [ ] 8. 공지 배너 + QR 화면
