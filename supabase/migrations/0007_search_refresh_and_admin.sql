-- Keep provider search text in sync when name/town change, and admin helpers.
create or replace function public.refresh_provider_search() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.full_name is distinct from old.full_name or new.town is distinct from old.town then
    update public.provider_profiles set updated_at = now() where id = new.id;
  end if;
  return new;
end $$;
revoke execute on function public.refresh_provider_search() from public, anon, authenticated;
create trigger profiles_refresh_search after update of full_name, town on public.profiles
  for each row execute function public.refresh_provider_search();

-- Admin: list users with contact details for support.
create or replace function public.admin_users(p_q text default null, p_limit int default 50)
returns table(id uuid, full_name text, phone text, email text, county_id smallint, is_provider boolean,
              verification_level smallint, suspended boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  return query
    select p.id, p.full_name, pp.phone, pp.email, p.county_id, p.is_provider, p.verification_level, p.suspended, p.created_at
      from public.profiles p left join public.profile_private pp on pp.user_id = p.id
     where p_q is null or p_q = '' or p.full_name ilike '%' || p_q || '%' or pp.phone ilike '%' || p_q || '%' or pp.email ilike '%' || p_q || '%'
     order by p.created_at desc
     limit least(p_limit, 200);
end $$;
revoke execute on function public.admin_users(text, int) from public, anon;
grant execute on function public.admin_users(text, int) to authenticated;
