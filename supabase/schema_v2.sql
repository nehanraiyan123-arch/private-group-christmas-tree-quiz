-- v2 upgrade for the live database: invite codes.
-- Also fixes ct_hash: pgcrypto lives in the extensions schema on Supabase,
-- so digest() must be schema-qualified (functions run with search_path=public).

create or replace function public.ct_hash(p_text text)
returns text language sql immutable as $$
  select case when p_text is null or p_text = '' then ''
              else encode(extensions.digest(p_text, 'sha256'), 'base64') end
$$;

-- Run this whole file once in the Supabase SQL Editor (safe to re-run).
-- Adds a 10-char joinCode to newly created trees + find_tree_by_code() lookup.

create or replace function public.create_tree(p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_title text; v_owner text; v_questions jsonb := '[]'::jsonb; q jsonb; c jsonb;
  v_choices jsonb; v_id text; v_token text; v_host text; v_pass text; v_tree jsonb; v_code text;
begin
  v_title := left(coalesce(nullif(trim(p_data->>'title'), ''), 'みんなのクリスマスツリー'), 60);
  v_owner := left(coalesce(nullif(trim(p_data->>'ownerName'), ''), 'ホスト'), 30);
  for q in select * from jsonb_array_elements(coalesce(p_data->'questions', '[]'::jsonb)) loop
    v_choices := '[]'::jsonb;
    for c in select * from jsonb_array_elements(coalesce(q->'choices', '[]'::jsonb)) loop
      v_choices := v_choices || jsonb_build_array(left(coalesce(c#>>'{}', ''), 80));
    end loop;
    if coalesce(trim(q->>'q'), '') <> '' and jsonb_array_length(v_choices) = 4
       and not exists (select 1 from jsonb_array_elements_text(v_choices) x where trim(x) = '') then
      v_questions := v_questions || jsonb_build_array(jsonb_build_object(
        'q', left(q->>'q', 200), 'choices', v_choices,
        'answer', least(3, greatest(0, coalesce((q->>'answer')::int, 0)))));
    end if;
  end loop;
  if jsonb_array_length(v_questions) < 3 or jsonb_array_length(v_questions) > 15 then
    return jsonb_build_object('ok', false, 'error', '質問は3〜15問で、すべて入力してください。');
  end if;

  v_id := public.ct_rand(8, 'abcdefghjkmnpqrstuvwxyz23456789');
  while exists (select 1 from public.trees where id = v_id) loop
    v_id := public.ct_rand(8, 'abcdefghjkmnpqrstuvwxyz23456789');
  end loop;
  v_token := public.ct_rand(24, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
  v_code := public.ct_rand(10, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789');
  while exists (select 1 from public.trees where data->>'joinCode' = v_code) loop
    v_code := public.ct_rand(10, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789');
  end loop;
  v_host := public.ct_rand(20, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
  v_pass := coalesce(trim(p_data->>'passcode'), '');
  v_tree := jsonb_build_object(
    'id', v_id, 'inviteToken', v_token, 'joinCode', v_code,
    'hostKeyHash', public.ct_hash(v_host),
    'title', v_title, 'ownerName', v_owner,
    'passcodeHash', public.ct_hash(v_pass), 'hasPasscode', v_pass <> '',
    'questions', v_questions,
    'participants', '[]'::jsonb,
    'createdAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  insert into public.trees(id, data) values (v_id, v_tree);
  return jsonb_build_object('ok', true, 'id', v_id, 'inviteToken', v_token, 'joinCode', v_code, 'hostKey', v_host,
    'url', '/?tree=' || v_id || '&invite=' || v_token);
end $$;

create or replace function public.find_tree_by_code(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t jsonb; v_code text;
begin
  v_code := upper(trim(coalesce(p_code, '')));
  if v_code = '' then
    return jsonb_build_object('ok', false, 'error', 'コードを入力してください。');
  end if;
  select data into t from public.trees where data->>'joinCode' = v_code limit 1;
  if t is null then
    return jsonb_build_object('ok', false, 'error', 'その招待コードのツリーが見つかりませんでした。');
  end if;
  return jsonb_build_object('ok', true, 'id', t->>'id', 'inviteToken', t->>'inviteToken');
end $$;

grant execute on function public.find_tree_by_code(text) to anon;
