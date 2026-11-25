-- Alert matching providers when a job is posted (same service; same county, or remote-capable for remote jobs).
create or replace function public.after_job_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; v_cat public.categories; v_budget text;
begin
  select * into v_cat from public.categories where id = new.category_id;
  v_budget := case
    when new.budget_max is not null then ' · KES ' || to_char(new.budget_max, 'FM999,999,999')
    when new.budget_min is not null then ' · KES ' || to_char(new.budget_min, 'FM999,999,999') || '+'
    else '' end;
  for r in
    select pp.id
      from public.provider_profiles pp
      join public.provider_categories pc on pc.provider_id = pp.id and pc.category_id = new.category_id
      join public.profiles p on p.id = pp.id
     where pp.available and not p.suspended and p.onboarded and pp.id <> new.buyer_id
       and ((not new.is_remote and p.county_id = new.county_id) or (new.is_remote and pp.remote_ok))
     order by (pp.is_pro and coalesce(pp.pro_until, now()) >= now()) desc, pp.rating_avg desc
     limit 200
  loop
    perform public.notify(r.id, 'job',
      case when new.urgency = 'asap' then '⚡ Urgent: ' else 'New job: ' end || v_cat.name_en,
      case when new.urgency = 'asap' then '⚡ Haraka: ' else 'Kazi mpya: ' end || v_cat.name_sw,
      new.title || v_budget, new.title || v_budget, '/jobs/' || new.id);
  end loop;
  return new;
end $$;
revoke execute on function public.after_job_insert() from public, anon, authenticated;

create trigger jobs_after_insert after insert on public.jobs
  for each row execute function public.after_job_insert();
