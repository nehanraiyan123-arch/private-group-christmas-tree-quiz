-- グループ限定クリスマスツリー — Supabase (Postgres) API
-- Run this whole file once in the Supabase SQL Editor.
-- Design: one table `trees` (id -> whole tree as jsonb). The table itself is locked by RLS
-- with NO policies, so the public anon key cannot read/write it directly.
-- All access goes through the SECURITY DEFINER RPC functions below, which enforce
-- the invite token + optional passcode (SHA-256) exactly like the original app.
-- Secret messages stay sealed until 2026-12-25 00:00 JST.

create extension if not exists pgcrypto;

create table if not exists public.trees (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.trees enable row level security;

-- ---------- helpers ----------
create or replace function public.ct_hash(p_text text)
returns text language sql immutable as $$
  select case when p_text is null or p_text = '' then ''
              else encode(digest(p_text, 'sha256'), 'base64') end
$$;

create or replace function public.ct_rand(p_len int, p_chars text)
returns text language plpgsql volatile as $$
declare s text := ''; i int;
begin
  for i in 1..p_len loop
    s := s || substr(p_chars, 1 + floor(random() * length(p_chars))::int, 1);
  end loop;
  return s;
end $$;

create or replace function public.ct_personality(p_percent int)
returns text language sql immutable as $$
  select case
    when p_percent >= 100 then '理解度MAXの聖夜パートナー'
    when p_percent >= 80 then '雪見ココアの賢者'
    when p_percent >= 60 then 'トナカイの名案内人'
    when p_percent >= 40 then 'キャンドルライトの見守り人'
    when p_percent >= 20 then '雪だるまの親友'
    else 'クリスマスの迷子サンタ見習い' end
$$;

create or replace function public.ct_personality_desc(p_percent int)
returns text language sql immutable as $$
  select case
    when p_percent >= 100 then 'ホストのことを完璧に理解している、聖夜に欠かせない相棒タイプです。'
    when p_percent >= 80 then '温かいココアのように深く相手を思いやる、賢くて優しいタイプです。'
    when p_percent >= 60 then '雪道でもみんなを導ける、頼れるトナカイタイプです。'
    when p_percent >= 40 then '静かに灯るキャンドルのように、そっと寄り添うタイプです。'
    when p_percent >= 20 then '一緒に雪だるまを作りたくなる、ほのぼの癒しタイプです。'
    else 'まだまだ伸びしろたっぷり！これからもっと仲良くなれるタイプです。' end
$$;

-- Load + validate a tree. Returns {ok:true, tree:{...}} or an error object.
create or replace function public.ct_validate(p_id text, p_token text, p_pass text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t jsonb;
begin
  if p_id is null or p_id !~ '^[A-Za-z0-9]{6,12}$' then
    return jsonb_build_object('ok', false, 'error', 'ツリーが見つかりませんでした。リンクを確認してください。');
  end if;
  select data into t from public.trees where id = p_id;
  if t is null then
    return jsonb_build_object('ok', false, 'error', 'ツリーが見つかりませんでした。リンクを確認してください。');
  end if;
  if p_token is null or p_token <> (t->>'inviteToken') then
    return jsonb_build_object('ok', false, 'code', 'BAD_TOKEN', 'error', '招待トークンが正しくありません。このツリーはグループ限定です。');
  end if;
  if coalesce(t->>'passcodeHash','') <> '' then
    if p_pass is null or p_pass = '' then
      return jsonb_build_object('ok', false, 'code', 'NEED_PASSCODE', 'needsPasscode', true,
        'title', t->>'title', 'ownerName', t->>'ownerName', 'hasPasscode', true, 'error', '合言葉が必要です。');
    end if;
    if public.ct_hash(p_pass) <> (t->>'passcodeHash') then
      return jsonb_build_object('ok', false, 'code', 'BAD_PASSCODE', 'needsPasscode', true,
        'title', t->>'title', 'ownerName', t->>'ownerName', 'hasPasscode', true, 'error', '合言葉が違います。');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'tree', t);
end $$;

-- ---------- API ----------
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

create or replace function public.get_tree_full(p_id text, p_token text, p_pass text, p_host text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb; t jsonb; v_unlocked boolean; v_parts jsonb;
begin
  v := public.ct_validate(p_id, p_token, p_pass);
  if not (v->>'ok')::boolean then return v; end if;
  t := v->'tree';
  v_unlocked := now() >= timestamptz '2026-12-25 00:00:00+09';
  select coalesce(jsonb_agg(jsonb_build_object(
      'no', (p->>'no')::int, 'nickname', p->>'nickname',
      'score', (p->>'score')::int, 'total', (p->>'total')::int, 'percent', (p->>'percent')::int,
      'personality', p->>'personality', 'personalityDesc', p->>'personalityDesc',
      'shape', p->>'shape', 'color', p->>'color', 'createdAt', p->>'createdAt',
      'message', case when v_unlocked then p->'message' else 'null'::jsonb end,
      'sealed', not v_unlocked) order by (p->>'no')::int), '[]'::jsonb)
    into v_parts
    from jsonb_array_elements(coalesce(t->'participants', '[]'::jsonb)) p;
  return jsonb_build_object(
    'ok', true, 'title', t->>'title', 'ownerName', t->>'ownerName',
    'hasPasscode', (t->>'hasPasscode')::boolean,
    'questionCount', jsonb_array_length(t->'questions'),
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('q', q->>'q', 'choices', q->'choices')
        order by ord), '[]'::jsonb)
      from jsonb_array_elements(t->'questions') with ordinality as e(q, ord)),
    'participants', v_parts,
    'unlocked', v_unlocked,
    'isHost', coalesce(p_host, '') <> '' and public.ct_hash(p_host) = (t->>'hostKeyHash'),
    'unlockMs', 1798124400000,
    'serverNowMs', (extract(epoch from now()) * 1000)::bigint);
end $$;

create or replace function public.get_preview_messages(p_id text, p_token text, p_pass text, p_host text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; t jsonb;
begin
  v := public.ct_validate(p_id, p_token, p_pass);
  if not (v->>'ok')::boolean then return v; end if;
  t := v->'tree';
  if coalesce(p_host, '') = '' or public.ct_hash(p_host) <> (t->>'hostKeyHash') then
    return jsonb_build_object('ok', false, 'error', 'プレビューはホストのみ利用できます。この端末でツリーを作成した場合に有効です。');
  end if;
  return jsonb_build_object('ok', true, 'participants',
    (select coalesce(jsonb_agg(jsonb_build_object(
        'no', (p->>'no')::int, 'nickname', p->>'nickname', 'message', p->'message',
        'personality', p->>'personality', 'score', (p->>'score')::int, 'total', (p->>'total')::int)
        order by (p->>'no')::int), '[]'::jsonb)
     from jsonb_array_elements(coalesce(t->'participants', '[]'::jsonb)) p));
end $$;

create or replace function public.join_tree(p_id text, p_token text, p_pass text, p_payload jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v jsonb; t jsonb; v_nick text; v_answers jsonb; v_score int := 0; v_total int;
  v_percent int; v_shape text; v_color text; v_part jsonb; v_no int;
begin
  -- Lock the row so simultaneous joins get correct sequential No. values
  select data into t from public.trees where id = p_id for update;
  if t is null then
    return jsonb_build_object('ok', false, 'error', 'ツリーが見つかりませんでした。リンクを確認してください。');
  end if;
  v := public.ct_validate(p_id, p_token, p_pass);
  if not (v->>'ok')::boolean then return v; end if;
  t := v->'tree';
  -- Re-lock using the validated copy's id (same row)
  select data into t from public.trees where id = p_id for update;

  v_nick := left(coalesce(trim(p_payload->>'nickname'), ''), 20);
  if v_nick = '' then return jsonb_build_object('ok', false, 'error', 'ニックネームを入力してください。'); end if;
  v_answers := coalesce(p_payload->'answers', '[]'::jsonb);
  v_total := jsonb_array_length(t->'questions');
  if jsonb_array_length(v_answers) <> v_total then
    return jsonb_build_object('ok', false, 'error', 'すべての質問に答えてください。');
  end if;
  select count(*) into v_score
    from jsonb_array_elements(t->'questions') with ordinality as e(q, ord)
    where coalesce((v_answers->>((ord - 1)::int))::int, -1) = (q->>'answer')::int;
  v_percent := case when v_total > 0 then round(v_score * 100.0 / v_total)::int else 0 end;
  v_shape := coalesce(p_payload->>'shape', 'ball');
  if v_shape not in ('ball','star','heart','bell','snow','gift') then v_shape := 'ball'; end if;
  v_color := coalesce(p_payload->>'color', '#e63946');
  if v_color !~ '^#[0-9a-fA-F]{6}$' then v_color := '#e63946'; end if;
  v_no := jsonb_array_length(coalesce(t->'participants', '[]'::jsonb)) + 1;
  v_part := jsonb_build_object(
    'no', v_no, 'nickname', v_nick, 'score', v_score, 'total', v_total, 'percent', v_percent,
    'personality', public.ct_personality(v_percent),
    'personalityDesc', public.ct_personality_desc(v_percent),
    'shape', v_shape, 'color', v_color,
    'message', left(coalesce(trim(p_payload->>'message'), ''), 300),
    'createdAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  t := jsonb_set(t, '{participants}', coalesce(t->'participants', '[]'::jsonb) || jsonb_build_array(v_part));
  update public.trees set data = t where id = p_id;
  return jsonb_build_object('ok', true, 'participant', jsonb_build_object(
      'no', v_no, 'nickname', v_nick, 'score', v_score, 'total', v_total, 'percent', v_percent,
      'personality', v_part->>'personality', 'personalityDesc', v_part->>'personalityDesc',
      'shape', v_shape, 'color', v_color),
    'unlocked', now() >= timestamptz '2026-12-25 00:00:00+09');
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

-- Public (anon) may call ONLY the API functions
revoke all on function public.ct_hash(text) from public;
revoke all on function public.ct_rand(int, text) from public;
revoke all on function public.ct_personality(int) from public;
revoke all on function public.ct_personality_desc(int) from public;
revoke all on function public.ct_validate(text, text, text) from public;
grant execute on function public.create_tree(jsonb) to anon;
grant execute on function public.get_tree_full(text, text, text, text) to anon;
grant execute on function public.get_preview_messages(text, text, text, text) to anon;
grant execute on function public.join_tree(text, text, text, jsonb) to anon;
grant execute on function public.find_tree_by_code(text) to anon;
