-- Manual integration verification. Runs only against a dedicated RAWNAQ schema.
-- All test records, including temporary auth identities, are rolled back.
-- Tests database permissions and operations; does not test Auth HTTP or login.
begin;
do $test$
declare a uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); o uuid:=gen_random_uuid(); lid uuid; aid uuid; rev integer; v jsonb; failed boolean;
begin
insert into auth.users(id) values(a),(r),(o);
insert into public.profiles(id,display_name,role) values(a,'إدارة اختبار مؤقت','admin'),(r,'موظفة اختبار مؤقت','rep'),(o,'موظفة أخرى للاختبار','rep');
perform set_config('request.jwt.claim.sub',r::text,true);
set local role authenticated;
lid:=public.add_lead(jsonb_build_object('name','اختبار مؤقت سيتم التراجع عنه','contact','rawnaq-transaction-test@example.invalid','owner_id',r,'source_id','src_meta','service_id','service_4plus','received_at',now()-interval '1 hour','next_at',now()));
if (select count(*) from public.leads where id=lid)<>1 then raise exception 'own_read_failed';end if;
failed:=false;
begin perform public.add_lead(jsonb_build_object('name','تكرار اختبار','contact','rawnaq-transaction-test@example.invalid','owner_id',r,'source_id','src_meta','service_id','service_4plus','received_at',now()-interval '1 hour')); exception when unique_violation then failed:=true;end;
if not failed then raise exception 'duplicate_not_blocked';end if;
perform set_config('request.jwt.claim.sub',o::text,true);
if (select count(*) from public.leads where id=lid)<>0 then raise exception 'rls_failed';end if;
failed:=false;
begin perform public.record_contact(lid,1,'{}'); exception when others then failed:=true;end;
if not failed then raise exception 'foreign_write_not_blocked';end if;
perform set_config('request.jwt.claim.sub',r::text,true);
if has_function_privilege('authenticated','public.require_lead(uuid,integer)','execute') then raise exception 'internal_rpc_exposed';end if;
if has_table_privilege('authenticated','public.leads','update') then raise exception 'direct_writes_exposed';end if;
perform public.record_contact(lid,1,jsonb_build_object('first_reply',true,'contact_at',now()-interval '30 minutes','outcome','interested','body','اختبار رد فقط','next_action','discovery','next_at',now()));
v:=jsonb_build_object('owner_id',r,'grade','hot','need','احتياج اختبار','next_action','offer_booking','next_at',now(),'stage','qualified');
perform public.update_lead(lid,2,v);
perform public.update_lead(lid,3,v||'{"stage":"booking_offered"}'::jsonb);
aid:=public.book_appointment(lid,4,jsonb_build_object('starts_at',now()+interval '1 day'));
perform public.set_appointment(aid,5,'{"status":"confirmed"}'::jsonb);
if (select stage from public.leads where id=lid)<>'booked' then raise exception 'booking_failed';end if;
reset role;
update public.appointments set starts_at=now()-interval '1 hour' where id=aid;
set local role authenticated;
perform public.set_appointment(aid,6,jsonb_build_object('status','no_show','next_at',now()));
if (select next_action from public.leads where id=lid)<>'recovery' then raise exception 'recovery_failed';end if;
perform set_config('request.jwt.claim.sub',a::text,true);
perform public.save_qa(lid,'{"scores":{"response":5,"greeting":10,"booking":null},"note":"اختبار مؤقت"}'::jsonb);
if (select score from public.qa_reviews where lead_id=lid)<>75 then raise exception 'qa_failed';end if;
if (select count(*) from public.activities where lead_id=lid)<7 then raise exception 'audit_failed';end if;
reset role;
end $test$;
rollback;
select 'passed: duplicate protection, RLS, ownership writes, internal RPC isolation, reply, qualification, booking, confirmation, no-show recovery, QA, audit; test records rolled back' as verification;
