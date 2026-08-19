begin;

alter table public.psn_accounts
  add column preferred_locale text not null default 'it-IT';

alter table public.psn_accounts
  add constraint psn_accounts_preferred_locale_check
  check (preferred_locale ~ '^[a-z]{2}-[A-Z]{2}$');

create unique index psn_accounts_one_per_owner_idx
  on public.psn_accounts(owner_user_id);

create table public.psn_credentials (
  id uuid primary key default gen_random_uuid(),
  psn_account_id uuid not null unique references public.psn_accounts(id) on delete cascade,
  encrypted_refresh_token text not null,
  encryption_iv text not null,
  encryption_auth_tag text not null,
  key_version integer not null,
  refresh_token_expires_at timestamptz not null,
  last_refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint psn_credentials_ciphertext_check check (length(encrypted_refresh_token) > 0),
  constraint psn_credentials_iv_check check (length(encryption_iv) > 0),
  constraint psn_credentials_auth_tag_check check (length(encryption_auth_tag) > 0),
  constraint psn_credentials_key_version_check check (key_version > 0)
);

create trigger psn_credentials_set_updated_at
before update on public.psn_credentials
for each row execute function public.set_updated_at();

alter table public.psn_credentials enable row level security;

-- Authenticated browser clients may inspect only their own connection metadata.
-- All connection mutations remain server-controlled through the service-role client.
grant select on public.psn_accounts to authenticated;
create policy psn_accounts_owner_select
on public.psn_accounts
for select
to authenticated
using (owner_user_id = auth.uid());

-- The service role is the only application writer for M3 connection state.
grant select, insert, update on public.psn_accounts to service_role;
grant select, insert, update, delete on public.psn_credentials to service_role;

-- Even ciphertext is server-only. Browser roles receive neither table privileges
-- nor policies for the credential table.
revoke all on public.psn_credentials from anon, authenticated;

comment on column public.psn_accounts.preferred_locale is
  'BCP-47 locale used for localized PSN trophy metadata. TrophyBridge v0.1 defaults to Italian (it-IT).';
comment on table public.psn_credentials is
  'Server-only encrypted PlayStation refresh credentials. NPSSO and access tokens are never persisted.';

commit;
