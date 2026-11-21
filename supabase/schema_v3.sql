-- v3 upgrade: public tree directory for the group hub.
-- Lists trees WITHOUT invite tokens: title, host, participant count only.
-- Entering a listed tree still requires its invite link or join code.
create or replace function public.list_public_trees()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  select coalesce(jsonb_agg(x order by (x->>'createdAt') desc), '[]'::jsonb) into r from (
    select jsonb_build_object(
      'id', t.id,
      'title', t.data->>'title',
      'ownerName', coalesce(t.data->>'ownerName','ホスト'),
      'participants', jsonb_array_length(coalesce(t.data->'participants','[]'::jsonb)),
      'createdAt', t.data->>'createdAt'
    ) as x, (t.data->>'createdAt') as createdAt
    from public.trees t
    limit 60
  ) q;
  return jsonb_build_object('ok', true, 'trees', r);
end $$;
revoke execute on function public.list_public_trees() from public;
grant execute on function public.list_public_trees() to anon;
