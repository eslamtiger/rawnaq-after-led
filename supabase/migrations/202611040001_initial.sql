begin;
create extension if not exists pgcrypto;
create table public.profiles(id uuid primary key references auth.users(id),display_name text not null check(length(trim(display_name))>0),role text not null check(role in ('admin','rep')),active boolean not null default true,created_at timestamptz not null default now());
create table public.configuration(id text primary key,category text not null,label text not null,body text,meta jsonb not null default '{}',sort_order int not null default 0,active boolean not null default true,created_at timestamptz not null default now());
create table public.leads(
 id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name))>0),contact text not null unique check(length(contact) between 3 and 160),owner_id uuid not null references public.profiles(id),source_id text not null references public.configuration(id),service_id text not null references public.configuration(id),campaign text not null default '',
 received_at timestamptz not null,first_response_at timestamptz,qualified_at timestamptz,booking_offered_at timestamptz,first_booked_at timestamptz,
 stage text not null default 'new' check(stage in ('new','contacted','qualified','booking_offered','follow_up','booked','attended','unqualified','lost')),
 grade text not null default 'cold' check(grade in ('hot','warm','cold','unqualified')),
 need text not null default '',objection_id text references public.configuration(id),lost_reason_id text references public.configuration(id),last_outcome text check(last_outcome in ('interested','later','no_answer','refused','information')),
 next_action text check(next_action in ('first_reply','discovery','information','offer_booking','follow_up','confirm','attendance','recovery')),next_at timestamptz,note text not null default '',follow_up_count int not null default 0,revision int not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(first_response_at is null or first_response_at>=received_at),check(stage in ('attended','unqualified','lost') or (next_action is not null and next_at is not null)),check(stage<>'lost' or lost_reason_id is not null)
);
create table public.appointments(id uuid primary key default gen_random_uuid(),lead_id uuid not null references public.leads(id),starts_at timestamptz not null,status text not null default 'scheduled' check(status in ('scheduled','confirmed','attended','no_show','cancelled')),note text not null default '',created_by uuid not null references public.profiles(id),created_at timestamptz not null default now());
create unique index one_active_appointment on public.appointments(lead_id) where status in ('scheduled','confirmed');
create table public.activities(id uuid primary key default gen_random_uuid(),lead_id uuid not null references public.leads(id),actor_id uuid not null references public.profiles(id),kind text not null,body text not null,details jsonb not null default '{}',created_at timestamptz not null default now());
create table public.qa_reviews(id uuid primary key default gen_random_uuid(),lead_id uuid not null references public.leads(id),rep_id uuid not null references public.profiles(id),reviewer_id uuid not null references public.profiles(id),scores jsonb not null,score numeric not null check(score between 0 and 100),note text not null default '',created_at timestamptz not null default now());
create index leads_owner on public.leads(owner_id);create index leads_next on public.leads(next_at);create index leads_received on public.leads(received_at);create index appointments_lead on public.appointments(lead_id);create index activities_lead on public.activities(lead_id);create index qa_lead on public.qa_reviews(lead_id);
create function public.is_member() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and active)$$;
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and active and role='admin')$$;
create function public.can_read_lead(lid uuid) returns boolean language sql stable security definer set search_path='' as $$select public.is_member() and exists(select 1 from public.leads where id=lid and (owner_id=auth.uid() or public.is_admin()))$$;
alter table public.profiles enable row level security;alter table public.configuration enable row level security;alter table public.leads enable row level security;alter table public.appointments enable row level security;alter table public.activities enable row level security;alter table public.qa_reviews enable row level security;
create policy profiles_read on public.profiles for select to authenticated using(public.is_member());
create policy config_read on public.configuration for select to authenticated using(public.is_member());
create policy leads_read on public.leads for select to authenticated using(public.is_member() and (owner_id=auth.uid() or public.is_admin()));
create policy appointments_read on public.appointments for select to authenticated using(public.can_read_lead(lead_id));
create policy activities_read on public.activities for select to authenticated using(public.can_read_lead(lead_id));
create policy qa_read on public.qa_reviews for select to authenticated using(public.can_read_lead(lead_id));
-- All writes pass through validated atomic operations. No direct client write grants.
revoke all on public.profiles,public.configuration,public.leads,public.appointments,public.activities,public.qa_reviews from anon,authenticated;
grant select on public.profiles,public.configuration,public.leads,public.appointments,public.activities,public.qa_reviews to authenticated;
create function public.assert_config(cid text,cat text) returns void language plpgsql security definer set search_path='' as $$begin if not exists(select 1 from public.configuration where id=cid and category=cat and active) then raise exception 'اختيار غير صالح أو غير مفعل';end if;end$$;
create function public.require_lead(lid uuid,expected int) returns public.leads language plpgsql security definer set search_path='' as $$declare l public.leads;begin
 if not public.is_member() then raise exception 'الحساب غير مصرح له';end if;
 select * into l from public.leads where id=lid for update;
 if not found or not public.can_read_lead(lid) then raise exception 'العميلة غير موجودة أو غير مسموح بالوصول';end if;
 if l.revision<>expected then raise exception 'revision_conflict';end if;return l;end$$;
create function public.add_lead(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare lid uuid;own uuid:=(p->>'owner_id')::uuid;received timestamptz:=(p->>'received_at')::timestamptz;contact text:=lower(regexp_replace(translate(p->>'contact','٠١٢٣٤٥٦٧٨٩','0123456789'),'[[:space:]()-]','','g'));begin
 if not public.is_member() then raise exception 'الحساب غير مصرح له';end if;
 if not public.is_admin() and own<>auth.uid() then raise exception 'لا يمكن إسناد عميلة لموظفة أخرى';end if;
 if not exists(select 1 from public.profiles where id=own and active) then raise exception 'اختاري موظفة مفعلة';end if;
 if received>now() then raise exception 'وقت الاستفسار لا يمكن أن يكون في المستقبل';end if;
 if contact~'^01[0125][0-9]{8}$' then contact:='+2'||contact;end if;if contact~'^0020' then contact:='+'||substr(contact,3);end if;
 if contact !~ '^(\+?[0-9]{7,15}|[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+|@[[:alnum:]_.]{2,})$' then raise exception 'اكتبي رقم تواصل أو بريد أو معرف صالح';end if;
 perform public.assert_config(p->>'source_id','source');perform public.assert_config(p->>'service_id','service');
 insert into public.leads(name,contact,owner_id,source_id,service_id,campaign,received_at,need,note,next_action,next_at)values(trim(p->>'name'),contact,own,p->>'source_id',p->>'service_id',coalesce(p->>'campaign',''),received,coalesce(p->>'need',''),coalesce(p->>'note',''),'first_reply',coalesce((p->>'next_at')::timestamptz,now()))returning id into lid;
 insert into public.activities(lead_id,actor_id,kind,body)values(lid,auth.uid(),'created','تمت إضافة العميلة وتحديد الموظفة المسؤولة');return lid;end$$;
create function public.update_lead(lid uuid,expected int,p jsonb) returns void language plpgsql security definer set search_path='' as $$declare l public.leads:=public.require_lead(lid,expected);own uuid:=(p->>'owner_id')::uuid;st text:=p->>'stage';ob text:=nullif(p->>'objection_id','');reason text:=nullif(p->>'lost_reason_id','');begin
 if st not in ('contacted','qualified','booking_offered','follow_up','lost','unqualified','booked') then raise exception 'اختاري حالة صالحة';end if;
 if st='booked' and l.stage<>'booked' then raise exception 'استخدمي تثبيت حجز لتغيير الحالة';end if;
 if l.stage='booked' and st<>'booked' then raise exception 'سجلي نتيجة الحجز أولًا';end if;
 if l.stage in ('attended','lost','unqualified') then raise exception 'أعيدي فتح الملف قبل التعديل';end if;
 if not public.is_admin() and own<>l.owner_id then raise exception 'تغيير الموظفة متاح للإدارة فقط';end if;
 if not exists(select 1 from public.profiles where id=own and active) then raise exception 'اختاري موظفة مفعلة';end if;
 if st not in ('lost','unqualified') and l.first_response_at is null then raise exception 'سجلي الرد الأول قبل تغيير الحالة';end if;
 if st in ('qualified','booking_offered') and length(trim(coalesce(p->>'need','')))=0 then raise exception 'سجلي ملخص الاحتياج أولًا';end if;
 if st in ('lost','unqualified') and exists(select 1 from public.appointments where lead_id=lid and status in ('scheduled','confirmed'))then raise exception 'ألغِي الحجز النشط أولًا';end if;
 if st='lost' then perform public.assert_config(reason,'lost_reason');end if;if ob is not null then perform public.assert_config(ob,'objection');end if;
 if st='unqualified' and length(trim(coalesce(p->>'note','')))=0 then raise exception 'وضحي سبب عدم التأهيل في الملاحظة';end if;
 update public.leads set owner_id=own,stage=st,grade=case when st='unqualified' then 'unqualified' else p->>'grade' end,need=coalesce(p->>'need',''),objection_id=ob,lost_reason_id=case when st='lost' then reason else null end,note=coalesce(p->>'note',''),next_action=case when st in ('lost','unqualified')then null else p->>'next_action'end,next_at=case when st in ('lost','unqualified')then null else (p->>'next_at')::timestamptz end,qualified_at=case when st in ('qualified','booking_offered') then coalesce(l.qualified_at,now())else l.qualified_at end,booking_offered_at=case when st='booking_offered'then coalesce(l.booking_offered_at,now())else l.booking_offered_at end,revision=revision+1,updated_at=now()where id=lid;
 insert into public.activities(lead_id,actor_id,kind,body,details)values(lid,auth.uid(),'updated','تم تحديث بيانات العميلة',jsonb_build_object('previous_stage',l.stage,'stage',st,'previous_owner',l.owner_id,'owner',own,'changes',p,'previous_need',l.need,'previous_note',l.note,'previous_next_at',l.next_at,'previous_next_action',l.next_action));end$$;
create function public.record_contact(lid uuid,expected int,p jsonb) returns void language plpgsql security definer set search_path='' as $$declare l public.leads:=public.require_lead(lid,expected);t timestamptz:=(p->>'contact_at')::timestamptz;first_reply boolean:=coalesce((p->>'first_reply')::boolean,false);begin
 if l.stage in ('lost','unqualified','attended') then raise exception 'الملف مغلق. أعيدي فتحه قبل تسجيل متابعة';end if;
 if t<l.received_at or t>now() then raise exception 'وقت التواصل يجب أن يكون بعد الاستفسار وحتى الآن';end if;
 if p->>'outcome' not in ('interested','later','no_answer','refused','information') then raise exception 'اختاري نتيجة التواصل';end if;
 if length(trim(coalesce(p->>'body','')))=0 then raise exception 'سجلي ملخص التواصل';end if;
 update public.leads set first_response_at=case when first_reply then coalesce(l.first_response_at,t)else l.first_response_at end,stage=case when l.stage='new' and first_reply then 'contacted'else l.stage end,last_outcome=p->>'outcome',next_action=p->>'next_action',next_at=(p->>'next_at')::timestamptz,follow_up_count=follow_up_count+case when coalesce((p->>'is_follow_up')::boolean,false)then 1 else 0 end,revision=revision+1,updated_at=now()where id=lid;
 insert into public.activities(lead_id,actor_id,kind,body,details,created_at)values(lid,auth.uid(),'contact',p->>'body',jsonb_build_object('outcome',p->>'outcome','first_reply',first_reply,'is_follow_up',p->>'is_follow_up','contact_at',t),now());end$$;
create function public.book_appointment(lid uuid,expected int,p jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare l public.leads:=public.require_lead(lid,expected);aid uuid;t timestamptz:=(p->>'starts_at')::timestamptz;begin
 if l.stage in ('lost','unqualified','attended') then raise exception 'أعيدي فتح الملف قبل الحجز';end if;
 if l.first_response_at is null or l.qualified_at is null or l.booking_offered_at is null then raise exception 'سجلي الرد والتأهيل وعرض الحجز قبل تثبيت الموعد';end if;
 if t<=now() then raise exception 'اختاري موعدًا في المستقبل';end if;
 insert into public.appointments(lead_id,starts_at,created_by,note)values(lid,t,auth.uid(),coalesce(p->>'note',''))returning id into aid;
 update public.leads set stage='booked',first_booked_at=coalesce(first_booked_at,now()),next_action='confirm',next_at=greatest(now(),t-interval '1 day'),revision=revision+1,updated_at=now()where id=lid;
 insert into public.activities(lead_id,actor_id,kind,body,details)values(lid,auth.uid(),'booked','تم تسجيل الحجز',jsonb_build_object('appointment_id',aid,'starts_at',t));return aid;end$$;
create function public.set_appointment(aid uuid,expected int,p jsonb) returns void language plpgsql security definer set search_path='' as $$declare a public.appointments;l public.leads;st text:=p->>'status';begin
 select * into a from public.appointments where id=aid; if not found then raise exception 'الحجز غير موجود';end if;
 l:=public.require_lead(a.lead_id,expected);
 select * into a from public.appointments where id=aid for update;
 if a.status not in ('scheduled','confirmed') then raise exception 'تم تسجيل نتيجة الحجز بالفعل';end if;
 if st not in ('confirmed','attended','no_show','cancelled')then raise exception 'اختاري نتيجة صالحة';end if;
 if st in ('attended','no_show') and a.starts_at>now()then raise exception 'لا يمكن تسجيل الحضور أو الغياب قبل الموعد';end if;
 update public.appointments set status=st,note=coalesce(p->>'note','')where id=aid;
 update public.leads set stage=case when st='attended'then 'attended'when st in ('no_show','cancelled')then 'follow_up'else 'booked'end,next_action=case when st='attended'then null when st='confirmed'then 'attendance'else 'recovery'end,next_at=case when st='attended'then null when st='confirmed'then a.starts_at else coalesce((p->>'next_at')::timestamptz,now())end,revision=revision+1,updated_at=now()where id=a.lead_id;
 insert into public.activities(lead_id,actor_id,kind,body,details)values(a.lead_id,auth.uid(),'appointment','تم تحديث نتيجة الحجز',jsonb_build_object('appointment_id',aid,'status',st,'note',p->>'note'));end$$;
create function public.reopen_lead(lid uuid,expected int,p jsonb)returns void language plpgsql security definer set search_path='' as $$declare l public.leads:=public.require_lead(lid,expected);begin
 if l.stage not in ('lost','unqualified','attended')then raise exception 'الملف مفتوح بالفعل';end if;
 if length(trim(coalesce(p->>'note','')))=0 then raise exception 'اكتبي سبب إعادة الفتح';end if;
 update public.leads set stage=case when first_response_at is null then 'new'else 'follow_up'end,lost_reason_id=null,grade=case when grade='unqualified' then 'cold' else grade end,next_action=case when first_response_at is null then 'first_reply'else 'follow_up'end,next_at=(p->>'next_at')::timestamptz,revision=revision+1,updated_at=now()where id=lid;
 insert into public.activities(lead_id,actor_id,kind,body)values(lid,auth.uid(),'reopened',p->>'note');end$$;
create function public.save_qa(lid uuid,p jsonb)returns void language plpgsql security definer set search_path='' as $$declare l public.leads;item record;w int;total numeric:=0;denom int:=0;weights jsonb:='{"response":10,"greeting":10,"discovery":15,"understanding":15,"trust":10,"objection":15,"booking":15,"follow_up":10}';begin
 if not public.is_admin() then raise exception 'مراجعة الجودة متاحة للإدارة فقط';end if;
 select * into l from public.leads where id=lid;if not found then raise exception 'العميلة غير موجودة';end if;
 for item in select key,value from jsonb_each(p->'scores') loop
 if not weights?item.key then raise exception 'معيار جودة غير صالح';end if;
 if item.value<>'null'::jsonb then w:=(weights->>item.key)::int;if (item.value#>>'{}')::numeric<0 or (item.value#>>'{}')::numeric>w then raise exception 'الدرجة خارج النطاق';end if;total:=total+(item.value#>>'{}')::numeric;denom:=denom+w;end if;end loop;
 if denom=0 then raise exception 'أدخلي درجة معيار واحد على الأقل';end if;
 insert into public.qa_reviews(lead_id,rep_id,reviewer_id,scores,score,note)values(lid,l.owner_id,auth.uid(),p->'scores',round(total/denom*100,1),coalesce(p->>'note',''));end$$;
create function public.manage_member(uid uuid,p jsonb)returns void language plpgsql security definer set search_path='' as $$begin
 if not public.is_admin()then raise exception 'متاح للإدارة فقط';end if;
 if uid=auth.uid()then raise exception 'لا يمكن تغيير صلاحيات حسابك من هنا';end if;
 if not coalesce((p->>'active')::boolean,false) and exists(select 1 from public.leads where owner_id=uid and stage not in ('attended','lost','unqualified'))then raise exception 'أعيدي إسناد العميلات المفتوحة قبل إيقاف الحساب';end if;
 insert into public.profiles(id,display_name,role,active)values(uid,trim(p->>'display_name'),p->>'role',(p->>'active')::boolean)on conflict(id)do update set display_name=excluded.display_name,role=excluded.role,active=excluded.active;end$$;
create function public.save_configuration(p jsonb)returns void language plpgsql security definer set search_path='' as $$begin
 if not public.is_admin() then raise exception 'متاح للإدارة فقط';end if;
 if p->>'category'not in ('source','service','objection','lost_reason','script','setting')then raise exception 'نوع إعداد غير صالح';end if;
 if exists(select 1 from public.configuration where id=p->>'id' and category<>p->>'category')then raise exception 'لا يمكن تغيير نوع الإعداد';end if;
 insert into public.configuration(id,category,label,body,active,sort_order)values(p->>'id',p->>'category',p->>'label',coalesce(p->>'body',''),coalesce((p->>'active')::boolean,true),0)on conflict(id)do update set label=excluded.label,body=excluded.body,active=excluded.active;end$$;
-- Revoke PostgreSQL's default PUBLIC function execution, including internal helpers.
revoke all on function public.is_member(),public.is_admin(),public.can_read_lead(uuid),public.assert_config(text,text),public.require_lead(uuid,int),public.add_lead(jsonb),public.update_lead(uuid,int,jsonb),public.record_contact(uuid,int,jsonb),public.book_appointment(uuid,int,jsonb),public.set_appointment(uuid,int,jsonb),public.reopen_lead(uuid,int,jsonb),public.save_qa(uuid,jsonb),public.manage_member(uuid,jsonb),public.save_configuration(jsonb)from public,anon;
grant execute on function public.is_member(),public.is_admin(),public.can_read_lead(uuid),public.add_lead(jsonb),public.update_lead(uuid,int,jsonb),public.record_contact(uuid,int,jsonb),public.book_appointment(uuid,int,jsonb),public.set_appointment(uuid,int,jsonb),public.reopen_lead(uuid,int,jsonb),public.save_qa(uuid,jsonb),public.manage_member(uuid,jsonb),public.save_configuration(jsonb)to authenticated;
commit;
