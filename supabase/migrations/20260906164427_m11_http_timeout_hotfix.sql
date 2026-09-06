-- Production parity hotfix for Supabase pgsql-http cold starts.
-- The extension defaults to a ~5s request timeout; allow a bounded 15s only
-- for the assistant bridge invocation, then reset curl options.

create or replace function private.invoke_trophybridge_ai_context(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private
as $$
declare
  v_request public.assistant_bridge_requests%rowtype;
  v_token text;
  v_url text;
  v_http jsonb;
  v_status integer;
  v_content text;
begin
  select r.*
  into v_request
  from public.assistant_bridge_requests r
  where r.id = p_request_id
    and r.consumed_at is null
    and r.expires_at > now();

  if not found then
    raise exception 'Assistant bridge request is missing, expired, or already consumed';
  end if;

  select s.token
  into v_token
  from private.assistant_bridge_request_secrets s
  where s.request_id = p_request_id;

  if v_token is null then
    raise exception 'Assistant bridge capability is unavailable';
  end if;

  if not exists (select 1 from pg_extension where extname = 'http') then
    raise exception 'The http extension is unavailable on this database host';
  end if;

  v_url := format(
    'https://trophybridge.vercel.app/api/internal/v1/assistant/accounts/%s/games/%s/ai-context?fresh=%s',
    v_request.psn_account_id,
    v_request.game_id,
    case when v_request.fresh_requested then '1' else '0' end
  );

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS'::varchar, '15000'::varchar);

  begin
    execute $http$
      select jsonb_build_object('status', status, 'content', content)
      from extensions.http((
        'GET',
        $1,
        ARRAY[
          extensions.http_header('Authorization'::varchar, ('Bearer ' || $2)::varchar),
          extensions.http_header('Accept'::varchar, 'application/json'::varchar)
        ]::extensions.http_header[],
        null,
        null
      )::extensions.http_request)
    $http$
    into v_http
    using v_url, v_token;
  exception
    when others then
      perform extensions.http_reset_curlopt();
      raise;
  end;

  perform extensions.http_reset_curlopt();

  delete from private.assistant_bridge_request_secrets where request_id = p_request_id;

  v_status := (v_http ->> 'status')::integer;
  v_content := v_http ->> 'content';

  if v_status between 200 and 299 then
    return v_content::jsonb;
  end if;

  return jsonb_build_object(
    'bridge_http_status', v_status,
    'response', case
      when v_content is null or v_content = '' then null
      else v_content::jsonb
    end
  );
end
$$;

revoke all on function private.invoke_trophybridge_ai_context(uuid) from public;
