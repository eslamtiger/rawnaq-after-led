begin;
-- Reply assistant support. Additive: no table or column changes.
-- 1) Admins can store template tags in configuration.meta from the settings screen.
--    Allowed keys only; every tag value is a list of short strings.
create or replace function public.save_configuration(p jsonb)returns void language plpgsql security definer set search_path='' as $$declare m jsonb:=p->'meta';k text;e jsonb;begin
 if not public.is_admin() then raise exception 'متاح للإدارة فقط';end if;
 if p->>'category'not in ('source','service','objection','lost_reason','script','setting')then raise exception 'نوع إعداد غير صالح';end if;
 if exists(select 1 from public.configuration where id=p->>'id' and category<>p->>'category')then raise exception 'لا يمكن تغيير نوع الإعداد';end if;
 if m is not null then
  if jsonb_typeof(m)<>'object' or length(m::text)>4000 then raise exception 'وسوم القالب غير صالحة';end if;
  for k in select jsonb_object_keys(m) loop
   if k not in ('states','temps','stages','objections','why','approved') then raise exception 'وسم غير معروف';end if;
   if k in ('states','temps','stages','objections') then
    if jsonb_typeof(m->k)<>'array' then raise exception 'وسوم القالب غير صالحة';end if;
    for e in select jsonb_array_elements(m->k) loop
     if jsonb_typeof(e)<>'string' or length(e#>>'{}')>60 then raise exception 'وسوم القالب غير صالحة';end if;
    end loop;
   elsif k='why' and jsonb_typeof(m->k)<>'string' then raise exception 'وسوم القالب غير صالحة';
   elsif k='approved' and jsonb_typeof(m->k)<>'boolean' then raise exception 'وسوم القالب غير صالحة';
   end if;
  end loop;
 end if;
 insert into public.configuration(id,category,label,body,active,sort_order,meta)values(p->>'id',p->>'category',p->>'label',coalesce(p->>'body',''),coalesce((p->>'active')::boolean,true),0,coalesce(m,'{}'::jsonb))on conflict(id)do update set label=excluded.label,body=excluded.body,active=excluded.active,meta=case when m is null then public.configuration.meta else excluded.meta end;end$$;
revoke all on function public.save_configuration(jsonb)from public,anon;
grant execute on function public.save_configuration(jsonb)to authenticated;
-- 2) The dynamic checklist progress is stored as an activity (activities.details).
--    It does not change the lead, so no revision check is needed.
create or replace function public.record_checklist(lid uuid,p jsonb)returns void language plpgsql security definer set search_path='' as $$begin
 if not public.is_member() then raise exception 'الحساب غير مصرح له';end if;
 if not public.can_read_lead(lid) then raise exception 'العميلة غير موجودة أو غير مسموح بالوصول';end if;
 if coalesce(jsonb_typeof(p->'done'),'')<>'object' or length(coalesce(p->>'key',''))=0 or length(p::text)>4000 then raise exception 'بيانات القائمة غير صالحة';end if;
 insert into public.activities(lead_id,actor_id,kind,body,details,occurred_at)values(lid,auth.uid(),'checklist','تحديث قائمة المتابعة',jsonb_build_object('key',p->>'key','done',p->'done','version',1),now());end$$;
revoke all on function public.record_checklist(uuid,jsonb)from public,anon;
grant execute on function public.record_checklist(uuid,jsonb)to authenticated;
commit;
