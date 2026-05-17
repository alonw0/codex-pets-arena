update public.profiles
set display_name = left(coalesce(nullif(display_name, ''), 'Trainer'), 40);

update public.pets
set
  name = left(name, 64),
  description = left(description, 512);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1), 'Trainer'), 40)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_display_name_length'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_display_name_length
      check (char_length(display_name) between 1 and 40);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pets_name_length'
      and conrelid = 'public.pets'::regclass
  ) then
    alter table public.pets
      add constraint pets_name_length
      check (char_length(name) between 1 and 64);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pets_description_length'
      and conrelid = 'public.pets'::regclass
  ) then
    alter table public.pets
      add constraint pets_description_length
      check (char_length(description) <= 512);
  end if;
end $$;

drop policy if exists "profiles self update" on public.profiles;

revoke insert, update, delete, truncate, references, trigger on public.profiles from anon;
revoke insert, update, delete, truncate, references, trigger on public.profiles from authenticated;
grant select on public.profiles to anon;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

create policy "profiles self update" on public.profiles
  for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and char_length(display_name) between 1 and 40
    and (avatar_url is null or char_length(avatar_url) <= 512)
  );

create or replace function public.increment_profile_result(target_profile_id uuid, result_column text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value integer;
begin
  if result_column = 'wins' then
    update public.profiles
    set wins = wins + 1
    where id = target_profile_id
    returning wins into next_value;
  elsif result_column = 'losses' then
    update public.profiles
    set losses = losses + 1
    where id = target_profile_id
    returning losses into next_value;
  else
    raise exception 'Unsupported profile result column: %', result_column;
  end if;

  if next_value is null then
    raise exception 'Profile % not found', target_profile_id;
  end if;

  return next_value;
end;
$$;

revoke all on function public.increment_profile_result(uuid, text) from public;
revoke all on function public.increment_profile_result(uuid, text) from anon;
revoke all on function public.increment_profile_result(uuid, text) from authenticated;
grant execute on function public.increment_profile_result(uuid, text) to service_role;
