begin;
-- Services carry a listed price in configuration.meta (admin only).
-- For services, the new meta is merged into the existing meta so older keys
-- (evidence/source from the seed) are kept. Other categories are unchanged.
create or replace function public.save_configuration(p jsonb)returns void language plpgsql security definer set search_path='' as $$
declare m jsonb:=p->'meta';k text;e jsonb;cat text:=p->>'category';
begin
 if not public.is_admin() then raise exception 'متاح للإدارة فقط';end if;
 if cat not in ('source','service','objection','lost_reason','script','setting')then raise exception 'نوع إعداد غير صالح';end if;
 if exists(select 1 from public.configuration where id=p->>'id' and category<>cat)then raise exception 'لا يمكن تغيير نوع الإعداد';end if;
 if length(trim(coalesce(p->>'label','')))=0 then raise exception 'اكتبي الاسم';end if;
 if m is not null then
  if jsonb_typeof(m)<>'object' or length(m::text)>4000 then raise exception 'بيانات الإعداد غير صالحة';end if;
  for k in select jsonb_object_keys(m) loop
   if cat='service' then
    if k not in ('price','price_note') then raise exception 'حقل غير معروف للخدمة';end if;
    if k='price' and not (m->k='null'::jsonb or (jsonb_typeof(m->k)='number' and (m->>k)::numeric between 0 and 10000000)) then raise exception 'السعر لازم يكون رقم من صفر لعشرة مليون';end if;
    if k='price_note' and (jsonb_typeof(m->k)<>'string' or length(m->>k)>120) then raise exception 'ملاحظة السعر طويلة';end if;
   else
    if k not in ('states','temps','stages','objections','why','approved') then raise exception 'وسم غير معروف';end if;
    if k in ('states','temps','stages','objections') then
     if jsonb_typeof(m->k)<>'array' then raise exception 'وسوم القالب غير صالحة';end if;
     for e in select jsonb_array_elements(m->k) loop
      if jsonb_typeof(e)<>'string' or length(e#>>'{}')>60 then raise exception 'وسوم القالب غير صالحة';end if;
     end loop;
    elsif k='why' and jsonb_typeof(m->k)<>'string' then raise exception 'وسوم القالب غير صالحة';
    elsif k='approved' and jsonb_typeof(m->k)<>'boolean' then raise exception 'وسوم القالب غير صالحة';
    end if;
   end if;
  end loop;
  if cat='service' then
   m:=coalesce((select meta from public.configuration where id=p->>'id'),'{}'::jsonb)||m;
   if m->'price'='null'::jsonb then m:=m-'price';end if;
  end if;
 end if;
 insert into public.configuration(id,category,label,body,active,sort_order,meta)
 values(p->>'id',cat,trim(p->>'label'),coalesce(p->>'body',''),coalesce((p->>'active')::boolean,true),
  coalesce((select max(sort_order)+1 from public.configuration where category=cat),1),coalesce(m,'{}'::jsonb))
 on conflict(id)do update set label=excluded.label,body=excluded.body,active=excluded.active,
  meta=case when m is null then public.configuration.meta else excluded.meta end;
end$$;
revoke all on function public.save_configuration(jsonb)from public,anon;
grant execute on function public.save_configuration(jsonb)to authenticated;
commit;
