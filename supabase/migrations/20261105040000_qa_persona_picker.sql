begin;
-- Demo-only: anonymous QA sessions choose one of a fixed list of staff names.
-- One persona is an admin. Access still expires with setting_qa_open_access
-- (max 49h) and is rejected by is_member() afterwards. Real (non-anonymous)
-- accounts can never be touched by this function.
create or replace function public.join_qa_workspace(p_person text) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); until_at timestamptz; who text:=trim(coalesce(p_person,'')); r text;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and is_anonymous) then
  raise exception 'هذا الدخول مخصص لنسخة الاختبار فقط';
 end if;
 if who not in ('سارة','أحمد','منى','كريم','مديرة المركز') then
  raise exception 'اختاري اسمًا من القائمة';
 end if;
 r:=case when who='مديرة المركز' then 'admin' else 'rep' end;
 select (meta->>'enabled_until')::timestamptz into until_at
 from public.configuration where id='setting_qa_open_access' and category='setting'
 and active and meta->>'qa_only'='true';
 if until_at is null or until_at<=now() or until_at>now()+interval '49 hours' then
  raise exception 'انتهت فترة الدخول التجريبي. يلزم إعادة تفعيلها من الإدارة';
 end if;
 insert into public.profiles(id,display_name,role,qa_expires_at)
 values(uid,who,r,until_at)
 on conflict(id) do update set display_name=excluded.display_name,role=excluded.role,qa_expires_at=excluded.qa_expires_at
 where public.profiles.qa_expires_at is not null;
 if not public.is_member() then raise exception 'حساب الاختبار موقوف';end if;
end$$;
revoke all on function public.join_qa_workspace(text) from public,anon;
grant execute on function public.join_qa_workspace(text) to authenticated;
commit;
