-- Seed data, storage buckets and scheduled jobs.

insert into public.counties(id, name) values
 (1,'Mombasa'),(2,'Kwale'),(3,'Kilifi'),(4,'Tana River'),(5,'Lamu'),(6,'Taita Taveta'),(7,'Garissa'),
 (8,'Wajir'),(9,'Mandera'),(10,'Marsabit'),(11,'Isiolo'),(12,'Meru'),(13,'Tharaka-Nithi'),(14,'Embu'),
 (15,'Kitui'),(16,'Machakos'),(17,'Makueni'),(18,'Nyandarua'),(19,'Nyeri'),(20,'Kirinyaga'),(21,'Murang''a'),
 (22,'Kiambu'),(23,'Turkana'),(24,'West Pokot'),(25,'Samburu'),(26,'Trans Nzoia'),(27,'Uasin Gishu'),
 (28,'Elgeyo-Marakwet'),(29,'Nandi'),(30,'Baringo'),(31,'Laikipia'),(32,'Nakuru'),(33,'Narok'),(34,'Kajiado'),
 (35,'Kericho'),(36,'Bomet'),(37,'Kakamega'),(38,'Vihiga'),(39,'Bungoma'),(40,'Busia'),(41,'Siaya'),
 (42,'Kisumu'),(43,'Homa Bay'),(44,'Migori'),(45,'Kisii'),(46,'Nyamira'),(47,'Nairobi')
on conflict (id) do nothing;

insert into public.categories(slug, name_en, name_sw, icon, kind, sort) values
 ('plumbing','Plumbing','Fundi Mabomba','wrench','local',10),
 ('electrical','Electrical','Fundi Umeme','zap','local',11),
 ('cleaning','Cleaning','Usafi','sparkles','local',12),
 ('mama-fua','Laundry & Mama Fua','Mama Fua','shirt','local',13),
 ('house-help','House Help & Nanny','Msaidizi wa Nyumbani','house','local',14),
 ('carpentry','Carpentry & Furniture','Seremala','hammer','local',15),
 ('masonry','Masonry & Tiling','Fundi Mwashi na Vigae','brick-wall','local',16),
 ('painting','Painting','Upakaji Rangi','paint-roller','local',17),
 ('mechanic','Car Mechanic','Fundi Magari','car','local',18),
 ('appliance-repair','Appliance Repair','Ukarabati wa Vifaa','washing-machine','local',19),
 ('phone-repair','Phone & Laptop Repair','Fundi Simu na Kompyuta','smartphone','local',20),
 ('beauty','Salon, Barber & Beauty','Saluni na Urembo','scissors','local',21),
 ('tailoring','Tailoring','Fundi Cherehani','ruler','local',22),
 ('moving','Moving & Transport','Kuhamisha Mizigo','truck','local',23),
 ('gardening','Gardening & Landscaping','Bustani na Mandhari','sprout','local',24),
 ('welding','Welding & Fabrication','Uchomeleaji','flame','local',25),
 ('solar','Solar & CCTV Installation','Ufungaji Sola na CCTV','sun','local',26),
 ('pest-control','Fumigation & Pest Control','Kunyunyizia Dawa','bug','local',27),
 ('tutoring','Tutoring & Lessons','Masomo ya Ziada','graduation-cap','local',28),
 ('catering','Catering & Chefs','Upishi','chef-hat','local',29),
 ('events','Events, DJ & MC','Matukio, DJ na MC','party-popper','local',30),
 ('photography','Photography & Video','Upigaji Picha na Video','camera','local',31),
 ('driver','Drivers & Chauffeurs','Madereva','car-front','local',32),
 ('security','Security Guards','Walinzi','shield','local',33),
 ('web-dev','Web & App Development','Utengenezaji wa Tovuti na Programu','code','remote',50),
 ('design','Graphic & Brand Design','Usanifu wa Michoro','palette','remote',51),
 ('writing','Writing & Translation','Uandishi na Tafsiri','pen-line','remote',52),
 ('marketing','Digital Marketing','Masoko ya Kidijitali','megaphone','remote',53),
 ('video-editing','Video & Audio Editing','Uhariri wa Video na Sauti','clapperboard','remote',54),
 ('accounting','Accounting & KRA Returns','Uhasibu na Ritani za KRA','calculator','remote',55),
 ('virtual-assistant','Virtual Assistant & Data Entry','Msaidizi wa Mtandaoni','headset','remote',56)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types) values
 ('avatars','avatars', true, 3145728, array['image/jpeg','image/png','image/webp']),
 ('portfolio','portfolio', true, 6291456, array['image/jpeg','image/png','image/webp']),
 ('job-photos','job-photos', true, 6291456, array['image/jpeg','image/png','image/webp']),
 ('verifications','verifications', false, 8388608, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

-- Users write only into a folder named after their user id: <uid>/<file>
create policy "upload own public media" on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars','portfolio','job-photos','verifications')
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "update own media" on storage.objects for update to authenticated
  using (bucket_id in ('avatars','portfolio','job-photos') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own media" on storage.objects for delete to authenticated
  using (bucket_id in ('avatars','portfolio','job-photos') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "read own verification docs" on storage.objects for select to authenticated
  using (bucket_id = 'verifications'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

-- ---------------------------------------------------------------------------
-- Scheduled jobs
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

create or replace function public.auto_release_due() returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_hours int;
begin
  select auto_release_hours into v_hours from public.platform_settings;
  for r in select id from public.bookings
            where status = 'delivered' and delivered_at < now() - make_interval(hours => v_hours)
  loop
    perform public.release_booking(r.id, null);
  end loop;
  -- STK pushes nobody answered
  update public.payments set status = 'cancelled', result_desc = 'Timed out'
   where status = 'pending' and created_at < now() - interval '15 minutes';
end $$;
revoke execute on function public.auto_release_due from public, anon, authenticated;

select cron.schedule('kazi-expire-pro', '7 * * * *', $$select public.expire_pro()$$);
select cron.schedule('kazi-auto-release', '*/15 * * * *', $$select public.auto_release_due()$$);
