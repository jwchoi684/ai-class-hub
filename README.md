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

**아직 GitHub 연동이 안 돼 있습니다.** 현재 배포는 파일을 직접 올린 것이라 푸시해도 자동 배포되지 않습니다. Vercel 대시보드에서 저장소를 연결하면 그때부터 `main` 푸시가 곧 배포가 됩니다.

## 기술 스택

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Vitest · Playwright · Vercel

Supabase(Postgres + Storage)는 3단계에서 붙습니다.

## 구조

```
src/
  app/          라우트. layout / page / not-found / error / robots
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
- [ ] 2. 관리자 시드 스크립트
- [ ] 3. 데이터 모델 + Storage
- [ ] 4. 운영자 비밀번호 게이트
- [ ] 5. 회차 생성 + 목록/상세
- [ ] 6. 자료 업로드 + 링크 등록
- [ ] 7. 갤러리 게시 + 카드 그리드 + PIN 삭제
- [ ] 8. 공지 배너 + QR 화면
