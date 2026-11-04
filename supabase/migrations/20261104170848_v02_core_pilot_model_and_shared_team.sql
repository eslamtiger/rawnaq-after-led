begin;
alter table public.leads add column qualification text not null default 'unknown' check (qualification in ('unknown','qualified','not_qualified'));
alter table public.leads drop constraint leads_stage_check;
alter table public.leads drop constraint leads_grade_check;
alter table public.leads drop constraint leads_check1;
alter table public.leads alter column grade drop not null;
alter table public.leads alter column grade drop default;
update public.leads set qualification=case when stage='unqualified' then 'not_qualified' when qualified_at is not null then 'qualified' else 'unknown' end, stage=case when stage in ('contacted','qualified','booking_offered','unqualified') then 'active' else stage end, grade=case when grade='unqualified' then null else grade end;
alter table public.leads add constraint leads_stage_check check(stage in ('new','active','follow_up','booked','no_show','attended','lost'));
alter table public.leads add constraint leads_grade_check check(grade in ('hot','warm','cold'));
alter table public.leads add constraint leads_open_action_check check(stage in ('attended','lost') or (next_action is not null and next_at is not null));
alter table public.activities add column occurred_at timestamptz;
create or replace function public.offer_booking(lid uuid,expected int) returns void language plpgsql security definer set search_path='' as $$declare l public.leads:=public.require_lead(lid,expected);begin
if l.stage in ('lost','attended') then raise exception 'أعيدي فتح الملف أولًا';end if;
if l.first_response_at is null then raise exception 'سجلي الرد الأول قبل عرض الحجز';end if;
if l.booking_offered_at is not null then raise exception 'عرض الحجز مسجل بالفعل';end if;
update public.leads set booking_offered_at=now(),revision=revision+1,updated_at=now() where id=lid;
insert into public.activities(lead_id,actor_id,kind,body,details,occurred_at) values(lid,auth.uid(),'booking_offered','تم عرض الحجز',jsonb_build_object('booking_offered_at',now()),now());end$$;
revoke all on function public.offer_booking(uuid,int) from public,anon;
grant execute on function public.offer_booking(uuid,int) to authenticated;
create or replace function public.update_lead(lid uuid,expected int,p jsonb) returns void language plpgsql security definer set search_path='' as $$declare l public.leads:=public.require_lead(lid,expected);st text:=p->>'stage';q text:=p->>'qualification';own uuid:=(p->>'owner_id')::uuid;begin
if st is null or st not in ('active','follow_up','lost','booked','no_show') then raise exception 'اختاري حالة صالحة';end if;
if l.stage in ('attended','lost') then raise exception 'أعيدي فتح الملف قبل التعديل';end if;
if st='booked' and l.stage<>'booked' then raise exception 'استخدمي تثبيت الحجز';end if;
if st='no_show' and l.stage<>'no_show' then raise exception 'سجلي نتيجة الحجز أولًا';end if;
if l.stage='booked' and st<>'booked' then raise exception 'سجلي نتيجة الحجز أولًا';end if;
if not public.is_admin() and own<>l.owner_id then raise exception 'تغيير الموظفة متاح للإدارة فقط';end if;
if not exists(select 1 from public.profiles where id=own and active) then raise exception 'اختاري موظفة مفعلة';end if;
if q is null or q not in ('unknown','qualified','not_qualified') then raise exception 'اختاري التأهيل';end if;
if q='qualified' and length(trim(coalesce(p->>'need','')))=0 then raise exception 'سجلي ملخص الاحتياج';end if;
if nullif(p->>'objection_id','') is not null then perform public.assert_config(p->>'objection_id','objection');end if;
if st='lost' then perform public.assert_config(p->>'lost_reason_id','lost_reason');end if;
update public.leads set stage=st,qualification=q,grade=nullif(p->>'grade',''),owner_id=own,need=coalesce(p->>'need',''),note=coalesce(p->>'note',''),lost_reason_id=case when st='lost' then p->>'lost_reason_id' else null end,objection_id=nullif(p->>'objection_id',''),qualified_at=case when q='qualified' then coalesce(l.qualified_at,now()) else l.qualified_at end,next_action=case when st='lost' then null else p->>'next_action' end,next_at=case when st='lost' then null else (p->>'next_at')::timestamptz end,revision=revision+1,updated_at=now() where id=lid;
insert into public.activities(lead_id,actor_id,kind,body,details,occurred_at) values(lid,auth.uid(),'updated','تحديث حالة وتأهيل العميلة',jsonb_build_object('old',to_jsonb(l),'new',(select to_jsonb(x) from public.leads x where id=lid)),now());end$$;


alter table public.appointments add column outcome_note text not null default '';
alter table public.appointments add column previous_appointment_id uuid references public.appointments(id);
alter table public.appointments add column reschedule_note text not null default '';
alter table public.appointments add column no_show_note text not null default '';
alter table public.appointments add column attendance_note text not null default '';
alter table public.appointments add column rebooking_note text not null default '';
create index appointments_previous on public.appointments(previous_appointment_id);
alter table public.appointments drop constraint appointments_status_check;
alter table public.appointments add constraint appointments_status_check check(status in ('scheduled','confirmed','attended','no_show','cancelled','rescheduled'));
create or replace function public.add_lead(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare lid uuid;own uuid:=(p->>'owner_id')::uuid;received timestamptz:=(p->>'received_at')::timestamptz;contact text:=lower(regexp_replace(translate(p->>'contact','٠١٢٣٤٥٦٧٨٩','0123456789'),'[[:space:]()-]','','g'));begin
 if not public.is_member() then raise exception 'الحساب غير مصرح له';end if;
 if not public.is_admin() and own<>auth.uid() then raise exception 'لا يمكن إسناد عميلة لموظفة أخرى';end if;
 if not exists(select 1 from public.profiles where id=own and active) then raise exception 'اختاري موظفة مفعلة';end if;
 if received is null or received>now() then raise exception 'وقت الاستفسار لا يمكن أن يكون في المستقبل';end if;
 if contact~'^01[0125][0-9]{8}$' then contact:='+2'||contact;end if;if contact~'^0020' then contact:='+'||substr(contact,3);end if;
 if contact !~ '^(\+?[0-9]{7,15}|[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+|@[[:alnum:]_.]{2,})$' then raise exception 'اكتبي رقم تواصل أو بريد أو معرف صالح';end if;
 perform public.assert_config(p->>'source_id','source');perform public.assert_config(p->>'service_id','service');
 insert into public.leads(name,contact,owner_id,source_id,service_id,campaign,received_at,need,note,next_action,next_at)values(trim(p->>'name'),contact,own,p->>'source_id',p->>'service_id',coalesce(p->>'campaign',''),received,coalesce(p->>'need',''),coalesce(p->>'note',''),'first_reply',coalesce((p->>'next_at')::timestamptz,now()))returning id into lid;
 insert into public.activities(lead_id,actor_id,kind,body)values(lid,auth.uid(),'created','تمت إضافة العميلة وتحديد الموظفة المسؤولة');return lid;end$$;
create or replace function public.record_contact(lid uuid,expected int,p jsonb) returns void language plpgsql security definer set search_path='' as $$declare l public.leads:=public.require_lead(lid,expected);t timestamptz:=(p->>'contact_at')::timestamptz;first_reply boolean:=coalesce((p->>'first_reply')::boolean,false);begin
 if l.stage in ('lost','attended') then raise exception 'الملف مغلق. أعيدي فتحه قبل تسجيل متابعة';end if;
 if t is null or t<l.received_at or t>now() then raise exception 'وقت التواصل يجب أن يكون بعد الاستفسار وحتى الآن';end if;
 if p->>'outcome' is null or p->>'outcome' not in ('interested','later','no_answer','refused','information') then raise exception 'اختاري نتيجة التواصل';end if;
 if first_reply and p->>'outcome'='no_answer' then raise exception 'عدم الرد ليس ردًا أولًا ناجحًا';end if;
 if first_reply and (p->>'next_action' is null or p->>'next_action'='first_reply') then raise exception 'اختاري الخطوة التالية بعد الرد الأول';end if; if length(trim(coalesce(p->>'body','')))=0 then raise exception 'سجلي ملخص التواصل';end if;
 update public.leads set first_response_at=case when first_reply then coalesce(l.first_response_at,t)else l.first_response_at end,stage=case when l.stage='new' and first_reply then 'active'else l.stage end,last_outcome=p->>'outcome',next_action=p->>'next_action',next_at=(p->>'next_at')::timestamptz,follow_up_count=follow_up_count+case when coalesce((p->>'is_follow_up')::boolean,false)then 1 else 0 end,revision=revision+1,updated_at=now()where id=lid;
 insert into public.activities(lead_id,actor_id,kind,body,details,created_at)values(lid,auth.uid(),'contact',p->>'body',jsonb_build_object('outcome',p->>'outcome','first_reply',first_reply,'is_follow_up',p->>'is_follow_up','contact_at',t,'next_action',p->>'next_action','next_at',p->>'next_at'),now());end$$;
create or replace function public.book_appointment(lid uuid,expected int,p jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare l public.leads:=public.require_lead(lid,expected);aid uuid;t timestamptz:=(p->>'starts_at')::timestamptz;begin
 if l.stage in ('lost','attended') then raise exception 'أعيدي فتح الملف قبل الحجز';end if;
 if l.first_response_at is null or l.qualification<>'qualified' or l.booking_offered_at is null then raise exception 'سجلي الرد والتأهيل وعرض الحجز قبل تثبيت الموعد';end if;
 if t is null or t<=now() then raise exception 'اختاري موعدًا في المستقبل';end if;
 insert into public.appointments(lead_id,starts_at,created_by,note,previous_appointment_id,rebooking_note)values(lid,t,auth.uid(),coalesce(p->>'note',''),(select id from public.appointments where lead_id=lid and status='no_show' order by created_at desc limit 1),case when l.stage='no_show' then coalesce(p->>'note','') else '' end)returning id into aid;
 update public.leads set stage='booked',first_booked_at=coalesce(first_booked_at,now()),next_action='confirm',next_at=greatest(now(),t-interval '1 day'),revision=revision+1,updated_at=now()where id=lid;
 insert into public.activities(lead_id,actor_id,kind,body,details)values(lid,auth.uid(),case when l.stage='no_show' then 'rebooked' else 'booked' end,case when l.stage='no_show' then 'تمت إعادة الحجز بعد الغياب' else 'تم تسجيل الحجز' end,jsonb_build_object('appointment_id',aid,'starts_at',t,'note',p->>'note'));return aid;end$$;
create or replace function public.set_appointment(aid uuid,expected int,p jsonb) returns void language plpgsql security definer set search_path='' as $$declare a public.appointments;l public.leads;st text:=p->>'status';begin
 select * into a from public.appointments where id=aid; if not found then raise exception 'الحجز غير موجود';end if;
 l:=public.require_lead(a.lead_id,expected);
 select * into a from public.appointments where id=aid for update;
 if a.status not in ('scheduled','confirmed') then raise exception 'تم تسجيل نتيجة الحجز بالفعل';end if;
 if st is null or st not in ('confirmed','attended','no_show','cancelled')then raise exception 'اختاري نتيجة صالحة';end if;
 if st in ('attended','no_show') and a.starts_at>now()then raise exception 'لا يمكن تسجيل الحضور أو الغياب قبل الموعد';end if;
 update public.appointments set status=st,note=a.note,no_show_note=case when st='no_show' and length(trim(coalesce(p->>'note','')))>0 then p->>'note' else a.no_show_note end,attendance_note=case when st='attended' and length(trim(coalesce(p->>'note','')))>0 then p->>'note' else a.attendance_note end, outcome_note=case when length(trim(coalesce(p->>'note','')))>0 then concat_ws(E'\n',nullif(a.outcome_note,''),p->>'note') else a.outcome_note end where id=aid;
 update public.leads set stage=case when st='attended'then 'attended'when st='no_show'then 'no_show' when st='cancelled'then 'follow_up'else 'booked'end,next_action=case when st='attended'then null when st='confirmed'then 'attendance'else 'recovery'end,next_at=case when st='attended'then null when st='confirmed'then a.starts_at else coalesce((p->>'next_at')::timestamptz,now())end,revision=revision+1,updated_at=now()where id=a.lead_id;
 insert into public.activities(lead_id,actor_id,kind,body,details)values(a.lead_id,auth.uid(),'appointment','تم تحديث نتيجة الحجز',jsonb_build_object('appointment_id',aid,'status',st,'note',p->>'note'));end$$;
create or replace function public.reopen_lead(lid uuid,expected int,p jsonb)returns void language plpgsql security definer set search_path='' as $$declare l public.leads:=public.require_lead(lid,expected);begin
 if l.stage not in ('lost','attended')then raise exception 'الملف مفتوح بالفعل';end if;
 if length(trim(coalesce(p->>'note','')))=0 then raise exception 'اكتبي سبب إعادة الفتح';end if;
 update public.leads set stage=case when first_response_at is null then 'new'else 'follow_up'end,lost_reason_id=null,next_action=case when first_response_at is null then 'first_reply'else 'follow_up'end,next_at=(p->>'next_at')::timestamptz,revision=revision+1,updated_at=now()where id=lid;
 insert into public.activities(lead_id,actor_id,kind,body)values(lid,auth.uid(),'reopened',p->>'note');end$$;
create or replace function public.correct_lead(lid uuid,expected int,p jsonb) returns void language plpgsql security definer set search_path='' as $$declare l public.leads:=public.require_lead(lid,expected); c text:=lower(regexp_replace(translate(p->>'contact','٠١٢٣٤٥٦٧٨٩','0123456789'),'[[:space:]()-]','','g'));begin
if c~'^01[0125][0-9]{8}$' then c:='+2'||c;end if;if c~'^0020' then c:='+'||substr(c,3);end if;
if c is null or c !~ '^(\+?[0-9]{7,15}|[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+|@[[:alnum:]_.]{2,})$' then raise exception 'اكتبي رقم تواصل أو معرف صالح';end if;
perform public.assert_config(p->>'source_id','source');perform public.assert_config(p->>'service_id','service');
update public.leads set name=trim(p->>'name'),contact=c,source_id=p->>'source_id',service_id=p->>'service_id',campaign=coalesce(p->>'campaign',''),revision=revision+1,updated_at=now() where id=lid;end$$;
revoke all on function public.correct_lead(uuid,int,jsonb) from public,anon;
grant execute on function public.correct_lead(uuid,int,jsonb) to authenticated;
create or replace function public.v02_validate_lead() returns trigger language plpgsql set search_path='' as $$begin
if new.stage not in ('lost','attended') and (new.next_action is null or new.next_at is null) then raise exception 'حددي الخطوة التالية وموعد متابعة صالح';end if;
if new.stage='lost' and new.lost_reason_id is null then raise exception 'اختاري سبب الفقد';end if;
if new.qualification='qualified' and length(trim(new.need))=0 then raise exception 'سجلي ملخص الاحتياج قبل التأهيل';end if;
if new.first_response_at<new.received_at then raise exception 'وقت الرد يجب أن يكون بعد وصول الاستفسار';end if;
if new.received_at>now() then raise exception 'وقت الاستفسار لا يمكن أن يكون في المستقبل';end if;
if new.first_response_at>now() then raise exception 'وقت الرد لا يمكن أن يكون في المستقبل';end if;
if new.first_response_at is not null and new.next_action='first_reply' then raise exception 'اختاري الخطوة التالية بعد الرد الأول';end if;
if new.stage='booked' and not exists(select 1 from public.appointments where lead_id=new.id and status in ('scheduled','confirmed')) then raise exception 'الحالة تتطلب حجزًا قائمًا';end if;
if new.stage='no_show' and not exists(select 1 from public.appointments where lead_id=new.id and status='no_show') then raise exception 'سجلي عدم الحضور من الحجز';end if;
return new;end$$;
create trigger v02_validate_lead before insert or update on public.leads for each row execute function public.v02_validate_lead();
create or replace function public.v02_audit_change() returns trigger language plpgsql security definer set search_path='' as $$declare pair record; names jsonb:='{"stage":"حالة العميلة","qualification":"التأهيل","grade":"درجة الاهتمام","owner_id":"الموظفة المسؤولة","next_at":"موعد المتابعة","next_action":"الخطوة التالية","name":"اسم العميلة","contact":"رقم التواصل","source_id":"المصدر","service_id":"الخدمة","campaign":"الحملة","lost_reason_id":"سبب الفقد"}';begin
for pair in select key,value from jsonb_each(names) loop
if to_jsonb(old)->pair.key is distinct from to_jsonb(new)->pair.key then
insert into public.activities(lead_id,actor_id,kind,body,details,occurred_at) values(new.id,auth.uid(),'field_changed','تغيير '||(pair.value#>>'{}'),jsonb_build_object('field',pair.key,'old',to_jsonb(old)->pair.key,'new',to_jsonb(new)->pair.key),now());end if;end loop;return new;end$$;
create trigger v02_audit_change after update on public.leads for each row execute function public.v02_audit_change();
revoke all on function public.v02_validate_lead(),public.v02_audit_change() from public,anon,authenticated;
create or replace function public.require_lead(lid uuid,expected int) returns public.leads language plpgsql security definer set search_path='' as $$declare l public.leads;begin
if not public.is_member() then raise exception 'الحساب غير مصرح له';end if;
select * into l from public.leads where id=lid for update;
if not found or not public.can_read_lead(lid) then raise exception 'العميلة غير موجودة أو غير مسموح بالوصول';end if;
if expected is null or expected<1 or l.revision is distinct from expected then raise exception 'revision_conflict';end if;return l;end$$;
-- Shared visibility is limited to explicitly provisioned RAWNAQ team members.
-- Anonymous sign-in alone never grants membership. Direct writes remain revoked.
create or replace function public.can_read_lead(lid uuid) returns boolean language sql stable security definer set search_path='' as $$select public.is_member() and exists(select 1 from public.leads where id=lid)$$;
alter policy leads_read on public.leads using ((select public.is_member()));
create or replace function public.reschedule_appointment(aid uuid,expected int,p jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare a public.appointments;l public.leads;nid uuid;t timestamptz:=(p->>'starts_at')::timestamptz;begin
select * into a from public.appointments where id=aid;
if not found then raise exception 'الحجز غير موجود';end if;
l:=public.require_lead(a.lead_id,expected);
select * into a from public.appointments where id=aid for update;
if a.status not in ('scheduled','confirmed') then raise exception 'استخدمي إعادة الحجز من ملف العميلة';end if;
if t is null or t<=now() then raise exception 'اختاري موعدًا في المستقبل';end if;
update public.appointments set status='rescheduled',reschedule_note=case when length(trim(coalesce(p->>'note','')))>0 then p->>'note' else reschedule_note end where id=aid;
insert into public.appointments(lead_id,starts_at,created_by,note,previous_appointment_id,rebooking_note) values(a.lead_id,t,auth.uid(),a.note,aid,coalesce(p->>'note','')) returning id into nid;
update public.leads set stage='booked',next_action='confirm',next_at=greatest(now(),t-interval '1 day'),revision=revision+1,updated_at=now() where id=a.lead_id;
insert into public.activities(lead_id,actor_id,kind,body,details,occurred_at) values(a.lead_id,auth.uid(),'rescheduled','تمت إعادة تحديد الموعد',jsonb_build_object('previous_appointment_id',aid,'appointment_id',nid,'old',a.starts_at,'new',t,'note',p->>'note'),now());return nid;end$$;
revoke all on function public.reschedule_appointment(uuid,int,jsonb) from public,anon;
grant execute on function public.reschedule_appointment(uuid,int,jsonb) to authenticated;
-- Anonymous QA access is explicit, expiring membership, never open registration.
alter table public.profiles add column qa_expires_at timestamptz;
create or replace function public.is_member() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=auth.uid() and p.active and (not u.is_anonymous or p.qa_expires_at>now()))$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$select public.is_member() and exists(select 1 from public.profiles where id=auth.uid() and active and role='admin')$$;
commit;
