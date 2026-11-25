-- Cold-start incentive: the first N providers in each county get Pro free for a set number of days.
alter table public.platform_settings
  add column if not exists founding_slots_per_county integer not null default 50,
  add column if not exists founding_pro_days integer not null default 90;

create or replace function public.grant_founding_pro() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_county smallint; v_slots int; v_days int; v_count int;
begin
  select founding_slots_per_county, founding_pro_days into v_slots, v_days from public.platform_settings;
  select county_id into v_county from public.profiles where id = new.id;
  if v_county is null or coalesce(v_slots, 0) <= 0 then return new; end if;
  select count(*) into v_count
    from public.provider_profiles pp join public.profiles p on p.id = pp.id
   where p.county_id = v_county;
  if v_count <= v_slots then
    update public.provider_profiles
       set is_pro = true, pro_until = greatest(coalesce(pro_until, now()), now()) + make_interval(days => v_days)
     where id = new.id;
    perform public.notify(new.id, 'pro', 'You''re a founding pro 🎉', 'Wewe ni fundi mwanzilishi 🎉',
      v_days || ' days of KaziKenya Pro are on us: unlimited quotes and top placement.',
      'Siku ' || v_days || ' za KaziKenya Pro bure: bei bila kikomo na nafasi ya juu.', '/wallet');
  end if;
  return new;
end $$;
revoke execute on function public.grant_founding_pro() from public, anon, authenticated;

create trigger provider_profiles_founding after insert on public.provider_profiles
  for each row execute function public.grant_founding_pro();
