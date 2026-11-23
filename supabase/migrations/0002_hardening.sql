begin;

alter table public.products
  add constraint products_unit_price_not_nan check (unit_price <> 'NaN'::numeric);
alter table public.invoice_lines
  add constraint invoice_lines_unit_price_not_nan check (unit_price <> 'NaN'::numeric);

create or replace function public.save_draft_invoice(
  p_invoice_id uuid,
  p_customer_id uuid,
  p_issue_date date,
  p_due_date date,
  p_notes text,
  p_lines jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_invoice_id uuid;
  v_status text;
  v_issue_date date := coalesce(p_issue_date, current_date);
  v_line jsonb;
  v_position integer := 0;
  v_product_id uuid;
  v_quantity numeric;
  v_unit_price numeric;
  v_vat_rate numeric;
  v_line_base numeric(12,2);
  v_line_vat numeric(12,2);
begin
  if v_owner_id is null then
    raise exception 'NOT_FOUND';
  end if;

  if p_invoice_id is not null then
    select i.id, i.status into v_invoice_id, v_status
    from public.invoices as i
    where i.id = p_invoice_id and i.owner_id = v_owner_id
    for update;

    if not found then
      raise exception 'NOT_FOUND';
    end if;
    if v_status <> 'draft' then
      raise exception 'INVOICE_NOT_DRAFT';
    end if;
  end if;

  perform 1 from public.customers as c
  where c.id = p_customer_id and c.owner_id = v_owner_id
  for key share;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'INVOICE_EMPTY';
  end if;
  if jsonb_array_length(p_lines) = 0 then
    raise exception 'INVOICE_EMPTY';
  end if;
  if p_due_date < v_issue_date then
    raise exception 'INVALID_LINE';
  end if;

  -- Validate every line before creating or replacing any invoice data.
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    if jsonb_typeof(v_line) <> 'object'
      or jsonb_typeof(v_line -> 'description') is distinct from 'string'
      or char_length(v_line ->> 'description') not between 1 and 200 then
      raise exception 'INVALID_LINE';
    end if;

    -- Unconstrained numeric preserves the price scale until validation is complete.
    v_quantity := (v_line ->> 'quantity')::numeric;
    v_unit_price := (v_line ->> 'unit_price')::numeric;
    v_vat_rate := (v_line ->> 'vat_rate')::numeric;

    if v_quantity is null or v_quantity <= 0 or v_quantity > 2147483647
      or v_quantity <> trunc(v_quantity)
      or v_unit_price is null or v_unit_price = 'NaN'::numeric
      or v_unit_price < 0 or v_unit_price > 9999999999.99
      or scale(v_unit_price) > 2
      or v_vat_rate is null or v_vat_rate not in (0, 4, 10, 21) then
      raise exception 'INVALID_LINE';
    end if;

    v_product_id := (v_line ->> 'product_id')::uuid;
    if v_product_id is not null then
      perform 1 from public.products as p
      where p.id = v_product_id and p.owner_id = v_owner_id
      for key share;
      if not found then
        raise exception 'NOT_FOUND';
      end if;
    end if;
  end loop;

  if p_invoice_id is null then
    insert into public.invoices (owner_id, customer_id, issue_date, due_date, notes)
    values (v_owner_id, p_customer_id, v_issue_date, p_due_date, p_notes)
    returning id into v_invoice_id;
  else
    update public.invoices
    set customer_id = p_customer_id, issue_date = v_issue_date,
        due_date = p_due_date, notes = p_notes
    where id = v_invoice_id and owner_id = v_owner_id;

    delete from public.invoice_lines
    where invoice_id = v_invoice_id and owner_id = v_owner_id;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_product_id := (v_line ->> 'product_id')::uuid;
    v_quantity := (v_line ->> 'quantity')::numeric;
    v_unit_price := (v_line ->> 'unit_price')::numeric;
    v_vat_rate := (v_line ->> 'vat_rate')::numeric;
    v_line_base := v_quantity * v_unit_price;
    v_line_vat := round(v_line_base * v_vat_rate / 100, 2);

    insert into public.invoice_lines (
      owner_id, invoice_id, product_id, position, description, quantity,
      unit_price, vat_rate, line_base, line_vat, line_total
    ) values (
      v_owner_id, v_invoice_id, v_product_id, v_position, v_line ->> 'description',
      v_quantity::integer, v_unit_price, v_vat_rate::smallint, v_line_base, v_line_vat,
      v_line_base + v_line_vat
    );
    v_position := v_position + 1;
  end loop;

  update public.invoices
  set subtotal = totals.subtotal, vat_total = totals.vat_total, total = totals.total
  from (
    select sum(l.line_base) as subtotal, sum(l.line_vat) as vat_total,
           sum(l.line_total) as total
    from public.invoice_lines as l
    where l.invoice_id = v_invoice_id and l.owner_id = v_owner_id
  ) as totals
  where id = v_invoice_id and owner_id = v_owner_id;

  return v_invoice_id;
exception
  -- Hide conversion, overflow and constraint details; preserve business exceptions.
  when data_exception or integrity_constraint_violation then
    raise exception 'INVALID_LINE';
end;
$$;

create or replace function public.issue_invoice(p_invoice_id uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_invoice public.invoices%rowtype;
  v_line record;
  v_product public.products%rowtype;
  v_year integer;
  v_last_number integer;
  v_number text;
begin
  if v_owner_id is null then
    raise exception 'NOT_FOUND';
  end if;

  select i.* into v_invoice from public.invoices as i
  where i.id = p_invoice_id and i.owner_id = v_owner_id
  for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_invoice.status <> 'draft' then
    raise exception 'INVOICE_NOT_DRAFT';
  end if;
  if not exists (
    select 1 from public.invoice_lines
    where invoice_id = p_invoice_id and owner_id = v_owner_id
  ) then
    raise exception 'INVOICE_EMPTY';
  end if;

  -- A consistent product order avoids deadlocks between different invoices.
  for v_line in
    select l.product_id, l.quantity from public.invoice_lines as l
    where l.invoice_id = p_invoice_id and l.owner_id = v_owner_id
      and l.product_id is not null
    order by l.product_id, l.position, l.id
  loop
    select p.* into v_product from public.products as p
    where p.id = v_line.product_id and p.owner_id = v_owner_id
    for update;
    if not found then
      raise exception 'NOT_FOUND';
    end if;
    if v_product.stock < v_line.quantity then
      raise exception 'INSUFFICIENT_STOCK' using detail = v_product.sku;
    end if;

    update public.products set stock = stock - v_line.quantity
    where id = v_product.id and owner_id = v_owner_id;
  end loop;

  v_year := extract(year from v_invoice.issue_date)::integer;
  insert into public.invoice_counters as counters (owner_id, year, last_number)
  values (v_owner_id, v_year, 1)
  on conflict (owner_id, year) do update
    set last_number = counters.last_number + 1
  returning last_number into v_last_number;

  v_number := v_year::text || '-' ||
    lpad(v_last_number::text, greatest(4, length(v_last_number::text)), '0');

  update public.invoices set number = v_number, status = 'issued', issued_at = now()
  where id = p_invoice_id and owner_id = v_owner_id;
  return v_number;
end;
$$;

revoke all on function public.save_draft_invoice(uuid, uuid, date, date, text, jsonb),
  public.issue_invoice(uuid)
  from public, anon, authenticated;
grant execute on function public.save_draft_invoice(uuid, uuid, date, date, text, jsonb),
  public.issue_invoice(uuid)
  to authenticated;

commit;
