create or replace function public.record_contact(lid uuid,expected int,p jsonb) returns void language plpgsql security definer set search_path='' as $$declare l public.leads:=public.require_lead(lid,expected);t timestamptz:=(p->>'contact_at')::timestamptz;first_reply boolean:=coalesce((p->>'first_reply')::boolean,false);begin
 if l.stage in ('lost','unqualified','attended') then raise exception 'الملف مغلق. أعيدي فتحه قبل تسجيل متابعة';end if;
 if t is null or t<l.received_at or t>now() then raise exception 'وقت التواصل يجب أن يكون بعد الاستفسار وحتى الآن';end if;
 if p->>'outcome' not in ('interested','later','no_answer','refused','information') then raise exception 'اختاري نتيجة التواصل';end if;
 if first_reply and (p->>'next_action' is null or p->>'next_action'='first_reply') then raise exception 'اختاري الخطوة التالية بعد الرد الأول'; end if;
 if length(trim(coalesce(p->>'body','')))=0 then raise exception 'سجلي ملخص التواصل';end if;
 update public.leads set first_response_at=case when first_reply then coalesce(l.first_response_at,t)else l.first_response_at end,stage=case when l.stage='new' and first_reply then 'contacted'else l.stage end,last_outcome=p->>'outcome',next_action=p->>'next_action',next_at=(p->>'next_at')::timestamptz,follow_up_count=follow_up_count+case when coalesce((p->>'is_follow_up')::boolean,false)then 1 else 0 end,revision=revision+1,updated_at=now()where id=lid;
 insert into public.activities(lead_id,actor_id,kind,body,details,created_at)values(lid,auth.uid(),'contact',p->>'body',jsonb_build_object('outcome',p->>'outcome','first_reply',first_reply,'is_follow_up',p->>'is_follow_up','contact_at',t),now());end$$;
create or replace function public.set_appointment(aid uuid,expected int,p jsonb) returns void language plpgsql security definer set search_path='' as $$declare a public.appointments;l public.leads;st text:=p->>'status';begin
 select * into a from public.appointments where id=aid; if not found then raise exception 'الحجز غير موجود';end if;
 l:=public.require_lead(a.lead_id,expected);
 select * into a from public.appointments where id=aid for update;
 if a.status not in ('scheduled','confirmed') then raise exception 'تم تسجيل نتيجة الحجز بالفعل';end if;
 if st not in ('confirmed','attended','no_show','cancelled')then raise exception 'اختاري نتيجة صالحة';end if;
 if st in ('attended','no_show') and a.starts_at>now()then raise exception 'لا يمكن تسجيل الحضور أو الغياب قبل الموعد';end if;
 update public.appointments set status=st,note=case when length(trim(coalesce(p->>'note','')))>0 then concat_ws(E'\n',nullif(a.note,''),p->>'note') else a.note end where id=aid;
 update public.leads set stage=case when st='attended'then 'attended'when st in ('no_show','cancelled')then 'follow_up'else 'booked'end,next_action=case when st='attended'then null when st='confirmed'then 'attendance'else 'recovery'end,next_at=case when st='attended'then null when st='confirmed'then a.starts_at else coalesce((p->>'next_at')::timestamptz,now())end,revision=revision+1,updated_at=now()where id=a.lead_id;
 insert into public.activities(lead_id,actor_id,kind,body,details)values(a.lead_id,auth.uid(),'appointment','تم تحديث نتيجة الحجز',jsonb_build_object('appointment_id',aid,'status',st,'note',p->>'note'));end$$;
