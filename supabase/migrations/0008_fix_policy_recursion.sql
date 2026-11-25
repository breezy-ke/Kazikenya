-- jobs policy referenced quotes and quotes policy referenced jobs → infinite recursion.
-- Break the cycle with SECURITY DEFINER helpers (they bypass RLS on the inner lookup).
create or replace function public.has_quoted(p_job uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.quotes where job_id = p_job and provider_id = auth.uid());
$$;

create or replace function public.owns_job(p_job uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.jobs where id = p_job and buyer_id = auth.uid());
$$;

-- Safe for anon: both return false when auth.uid() is null (needed because policies are evaluated for anon browsing).
grant execute on function public.has_quoted(uuid), public.owns_job(uuid) to anon, authenticated;

drop policy "read jobs" on public.jobs;
create policy "read jobs" on public.jobs for select using (
  status = 'open' or buyer_id = (select auth.uid()) or public.is_admin() or public.has_quoted(id));

drop policy "read quotes" on public.quotes;
create policy "read quotes" on public.quotes for select using (
  provider_id = (select auth.uid()) or public.is_admin() or public.owns_job(job_id));
