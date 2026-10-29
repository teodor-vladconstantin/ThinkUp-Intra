create or replace function import_ambassadors(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row jsonb;
  v_ambassador_id int;
  v_count int := 0;
  v_full_name text;
  v_school_id int;
  v_email text;
  v_phone text;
begin
  if not is_pn_dept() then
    raise exception 'only PN members can import ambassadors';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 500 then
    raise exception 'invalid ambassador import size';
  end if;

  perform pg_advisory_xact_lock(hashtext('import_ambassadors'));

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_row) <> 'object' then
      raise exception 'invalid ambassador row';
    end if;

    v_full_name := btrim(v_row->>'full_name');
    v_school_id := (v_row->>'school_id')::int;
    v_email := nullif(btrim(v_row->>'email'), '');
    v_phone := nullif(btrim(v_row->>'phone'), '');

    if v_full_name is null or v_full_name = '' or length(v_full_name) > 150 or v_school_id is null or v_school_id < 1 then
      raise exception 'ambassador name and school are required';
    end if;
    if (v_email is not null and length(v_email) > 200) or (v_phone is not null and length(v_phone) > 40) then
      raise exception 'ambassador contact is too long';
    end if;
    if exists (
      select 1
      from ambassadors a
      where a.school_id = v_school_id
        and lower(btrim(a.full_name)) = lower(v_full_name)
    ) then
      raise exception 'duplicate ambassador name in school';
    end if;

    insert into ambassadors (full_name, school_id)
    values (v_full_name, v_school_id)
    returning id into v_ambassador_id;

    if v_email is not null or v_phone is not null then
      insert into ambassador_contacts (ambassador_id, email, phone)
      values (v_ambassador_id, v_email, v_phone);
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end
$$;
