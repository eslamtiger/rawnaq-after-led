begin;
alter table public.activities add column recorded_at timestamptz generated always as (created_at) stored;
create or replace function public.v02_prepare_activity() returns trigger language plpgsql set search_path='' as $$
begin
 new.occurred_at:=coalesce(new.occurred_at,(new.details->>'contact_at')::timestamptz,new.created_at);
 if new.kind='created' then
  new.details:=new.details||jsonb_build_object('lead',(select to_jsonb(l) from public.leads l where l.id=new.lead_id));
 end if;
 return new;
end$$;
create trigger v02_prepare_activity before insert on public.activities for each row execute function public.v02_prepare_activity();
update public.activities set occurred_at=coalesce((details->>'contact_at')::timestamptz,created_at) where occurred_at is null;
alter table public.activities alter column occurred_at set default now();
alter table public.activities alter column occurred_at set not null;
revoke all on function public.v02_prepare_activity() from public,anon,authenticated;
commit;
