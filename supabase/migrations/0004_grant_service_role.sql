-- ============================================================================
-- service_role 권한을 명시적으로 부여한다
--
-- 0001 은 "새 테이블에는 호스트가 알아서 service_role 권한을 준다"는 전제 위에
-- 서 있었습니다. 그 전제가 환경마다 다릅니다:
--
--   호스팅 Supabase  postgres 기본 ACL → service_role=arwdDxtm  (전 권한)
--   로컬 CLI 스택    postgres 기본 ACL → service_role=Dxtm      (SELECT 조차 없음)
--
-- 그래서 프로덕션에서는 멀쩡히 돌던 것이 로컬에서는 PostgREST 가 42501
-- permission denied 를 내며 전부 실패합니다. 앱은 "운영자 비밀번호가 아직
-- 설정되지 않았어요"라는 엉뚱한 메시지를 띄우는데, 실제 원인은 권한입니다.
--
-- 암묵적 기본값에 기대는 대신 필요한 권한을 직접 적습니다. 이러면 어떤
-- 환경에서 복원하든, 누가 저장소를 새로 클론해 로컬 스택을 띄우든 같게 동작합니다.
--
-- 왜 이 앱은 service_role 만 필요한가: anon key 를 브라우저에 내려보내지 않고
-- 모든 읽기·쓰기를 서버가 대신하기 때문입니다 (docs/REQUIREMENTS.md §2.2).
-- 그래서 anon/authenticated 는 0001 에서 회수한 상태 그대로 둡니다.
-- ============================================================================

-- 이미 만들어진 객체
grant select, insert, update, delete on all tables    in schema public to service_role;
grant usage, select                  on all sequences in schema public to service_role;
grant execute                        on all functions in schema public to service_role;

-- 앞으로 만들어질 객체. 이게 없으면 다음 마이그레이션에서 추가한 테이블만
-- 조용히 권한 없이 태어나고, 그 테이블을 쓰는 화면에서야 처음 드러납니다.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;

-- 0001 에서 만든 공개 뷰도 명시적으로.
grant select on gallery_posts_public to service_role;

-- 0001 의 의도를 재확인합니다. 위의 grant 문들이 anon 을 건드리지 않지만,
-- 권한 관련 마이그레이션은 끝에서 원하는 상태를 한 번 더 못박는 편이
-- 나중에 읽을 때 안전합니다.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
