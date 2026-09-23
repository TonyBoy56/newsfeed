-- Signal: database setup for accounts & encrypted sync.
-- Run this once in your Supabase project: Dashboard → SQL Editor → New query → paste → Run.
--
-- One row per account holds:
--   * the wrapped (encrypted) data key, plus the salts needed to unwrap it
--   * one AES-256-GCM encrypted blob with your interests, notes, saves and settings
-- The server can't read any of it. Row-level security makes sure each
-- account can only ever touch its own row, and that accounts with
-- two-factor turned on must have passed it (aal2) to do so.

create table if not exists public.vault (
  user_id              uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  version              bigint      not null default 1,        -- optimistic concurrency between devices
  kdf                  text        not null default 'PBKDF2-SHA256',
  kdf_iterations       integer     not null check (kdf_iterations >= 310000),
  kdf_salt             text        not null check (length(kdf_salt) <= 64),
  wrapped_key          text        not null check (length(wrapped_key) <= 256),
  wrapped_key_iv       text        not null check (length(wrapped_key_iv) <= 64),
  recovery_salt        text        not null check (length(recovery_salt) <= 64),
  recovery_wrapped_key text        not null check (length(recovery_wrapped_key) <= 256),
  recovery_iv          text        not null check (length(recovery_iv) <= 64),
  data                 text                 check (length(data) <= 8000000),  -- ~6 MB of encrypted data
  data_iv              text                 check (length(data_iv) <= 64),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Row-level security: on, and enforced even for the table owner.
alter table public.vault enable row level security;
alter table public.vault force row level security;

-- Logged-out visitors get nothing. Signed-in users get only what the policies allow.
revoke all on public.vault from anon;
revoke all on public.vault from authenticated;
grant select, insert, update, delete on public.vault to authenticated;

drop policy if exists "vault: read own row"   on public.vault;
drop policy if exists "vault: create own row" on public.vault;
drop policy if exists "vault: update own row" on public.vault;
drop policy if exists "vault: delete own row" on public.vault;
drop policy if exists "vault: require 2FA when enrolled" on public.vault;

create policy "vault: read own row"   on public.vault for select to authenticated using ((select auth.uid()) = user_id);
create policy "vault: create own row" on public.vault for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "vault: update own row" on public.vault for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "vault: delete own row" on public.vault for delete to authenticated using ((select auth.uid()) = user_id);

-- If an account has a verified authenticator, its session must have passed
-- two-factor (aal2) to touch its row. A stolen password alone isn't enough.
create policy "vault: require 2FA when enrolled" on public.vault as restrictive for all to authenticated
  using (
    array[(select auth.jwt() ->> 'aal')] <@ (
      select case when count(id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
      from auth.mfa_factors
      where (select auth.uid()) = user_id and status = 'verified'
    )
  )
  with check (
    array[(select auth.jwt() ->> 'aal')] <@ (
      select case when count(id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
      from auth.mfa_factors
      where (select auth.uid()) = user_id and status = 'verified'
    )
  );

-- Keep updated_at honest, and don't let clients rewrite history fields.
create or replace function public.vault_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.created_at := old.created_at;
  new.user_id := old.user_id;
  return new;
end $$;

drop trigger if exists vault_touch on public.vault;
create trigger vault_touch before update on public.vault for each row execute function public.vault_touch();
