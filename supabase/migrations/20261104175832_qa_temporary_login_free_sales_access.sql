begin;
-- Disabled by default; opening QA requires an explicit, expiring configuration row.
create or replace function public.join_qa_workspace() returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); until_at timestamptz;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and is_anonymous) then
  raise exception 'هذا الدخول مخصص لنسخة الاختبار فقط';
 end if;
 select (meta->>'enabled_until')::timestamptz into until_at
 from public.configuration where id='setting_qa_open_access' and category='setting'
 and active and meta->>'qa_only'='true';
 if until_at is null or until_at<=now() or until_at>now()+interval '49 hours' then
  raise exception 'انتهت فترة الدخول التجريبي. يلزم إعادة تفعيلها من الإدارة';
 end if;
 insert into public.profiles(id,display_name,role,qa_expires_at)
 values(uid,'تجربة رونق','rep',until_at) on conflict(id) do nothing;
 update public.profiles set qa_expires_at=until_at
 where id=uid and role='rep' and active and qa_expires_at is not null;
 if not public.is_member() then raise exception 'حساب الاختبار موقوف';end if;
end$$;
revoke all on function public.join_qa_workspace() from public,anon;
grant execute on function public.join_qa_workspace() to authenticated;
commit;
