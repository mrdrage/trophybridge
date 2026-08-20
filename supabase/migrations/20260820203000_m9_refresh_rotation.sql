begin;

-- A refresh-token expiry belongs to the token Sony issued at that moment.
-- During refresh, PSN can rotate the refresh token without returning a new
-- refresh_token_expires_in value. In that case carrying the previous token's
-- absolute expiry forward would make TrophyBridge force a false reauth.
alter table public.psn_credentials
  alter column refresh_token_expires_at drop not null;

comment on column public.psn_credentials.refresh_token_expires_at is
  'Provider-reported expiry for the currently stored refresh token when known. NULL means PSN rotated the token without reporting a new absolute lifetime; TrophyBridge then lets PSN decide validity on the next refresh instead of inheriting the old token expiry.';

commit;
