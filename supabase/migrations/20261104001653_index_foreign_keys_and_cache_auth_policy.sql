alter policy leads_read on public.leads using((select public.is_member()) and (owner_id=(select auth.uid()) or (select public.is_admin())));
create index activities_actor on public.activities(actor_id);
create index appointments_creator on public.appointments(created_by);
create index leads_source on public.leads(source_id);
create index leads_service on public.leads(service_id);
create index leads_objection on public.leads(objection_id);
create index leads_lost_reason on public.leads(lost_reason_id);
create index qa_rep on public.qa_reviews(rep_id);
create index qa_reviewer on public.qa_reviews(reviewer_id);
