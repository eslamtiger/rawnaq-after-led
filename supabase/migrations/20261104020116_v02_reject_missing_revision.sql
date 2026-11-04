create or replace function public.require_lead(lid uuid,expected int) returns public.leads language plpgsql security definer set search_path='' as $$declare l public.leads;begin
 if not public.is_member() then raise exception 'الحساب غير مصرح له';end if;
 select * into l from public.leads where id=lid for update;
 if not found or not public.can_read_lead(lid) then raise exception 'العميلة غير موجودة أو غير مسموح بالوصول';end if;
 if expected is null or l.revision is distinct from expected then raise exception 'revision_conflict';end if;return l;end$$;
