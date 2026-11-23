begin;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  tax_id text,
  email text,
  phone text,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  sku text not null check (char_length(sku) between 1 and 40),
  name text not null check (char_length(name) between 1 and 120),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  vat_rate smallint not null check (vat_rate in (0, 4, 10, 21)),
  stock integer not null default 0 check (stock >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  created_at timestamptz not null default now(),
  unique (owner_id, sku)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  customer_id uuid not null references public.customers on delete restrict,
  number text,
  status text not null default 'draft' check (status in ('draft', 'issued', 'paid', 'cancelled')),
  issue_date date not null default current_date,
  due_date date check (due_date >= issue_date),
  notes text,
  subtotal numeric(12,2) not null default 0,
  vat_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  issued_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  unique (owner_id, number)
);

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  invoice_id uuid not null references public.invoices on delete cascade,
  product_id uuid references public.products on delete set null,
  position integer not null,
  description text not null check (char_length(description) between 1 and 200),
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  vat_rate smallint not null check (vat_rate in (0, 4, 10, 21)),
  line_base numeric(12,2) not null,
  line_vat numeric(12,2) not null,
  line_total numeric(12,2) not null
);

create table if not exists public.invoice_counters (
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  year integer not null,
  last_number integer not null default 0,
  primary key (owner_id, year)
);

create index if not exists customers_owner_name_idx on public.customers (owner_id, name);
create index if not exists products_owner_name_idx on public.products (owner_id, name);
create index if not exists invoices_owner_status_issue_date_idx
  on public.invoices (owner_id, status, issue_date desc);
create index if not exists invoice_lines_invoice_id_idx on public.invoice_lines (invoice_id);

alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.invoice_counters enable row level security;

create policy customers_select on public.customers for select to authenticated
  using (owner_id = auth.uid());
create policy customers_insert on public.customers for insert to authenticated
  with check (owner_id = auth.uid());
create policy customers_update on public.customers for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy customers_delete on public.customers for delete to authenticated
  using (owner_id = auth.uid());

create policy products_select on public.products for select to authenticated
  using (owner_id = auth.uid());
create policy products_insert on public.products for insert to authenticated
  with check (owner_id = auth.uid());
create policy products_update on public.products for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy products_delete on public.products for delete to authenticated
  using (owner_id = auth.uid());

create policy invoices_select on public.invoices for select to authenticated
  using (owner_id = auth.uid());
create policy invoices_delete on public.invoices for delete to authenticated
  using (owner_id = auth.uid() and status = 'draft');

create policy invoice_lines_select on public.invoice_lines for select to authenticated
  using (owner_id = auth.uid());

-- Reset inherited defaults, including TRUNCATE, which is not protected by RLS.
revoke all on table public.customers, public.products, public.invoices,
  public.invoice_lines, public.invoice_counters from public, anon, authenticated;
grant select, insert, update, delete on table public.customers, public.products to authenticated;
grant select, delete on table public.invoices to authenticated;
grant select on table public.invoice_lines to authenticated;

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
  v_line jsonb;
  v_position integer := 0;
  v_product_id uuid;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_vat_rate smallint;
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

  if p_invoice_id is null then
    insert into public.invoices (owner_id, customer_id, issue_date, due_date, notes)
    values (v_owner_id, p_customer_id, p_issue_date, p_due_date, p_notes)
    returning id into v_invoice_id;
  else
    update public.invoices
    set customer_id = p_customer_id, issue_date = p_issue_date,
        due_date = p_due_date, notes = p_notes
    where id = v_invoice_id and owner_id = v_owner_id;

    delete from public.invoice_lines
    where invoice_id = v_invoice_id and owner_id = v_owner_id;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_product_id := (v_line ->> 'product_id')::uuid;
    if v_product_id is not null then
      perform 1 from public.products as p
      where p.id = v_product_id and p.owner_id = v_owner_id
      for key share;
      if not found then
        raise exception 'NOT_FOUND';
      end if;
    end if;

    v_quantity := (v_line ->> 'quantity')::integer;
    v_unit_price := (v_line ->> 'unit_price')::numeric(12,2);
    v_vat_rate := (v_line ->> 'vat_rate')::smallint;
    v_line_base := v_quantity * v_unit_price;
    v_line_vat := round(v_line_base * v_vat_rate / 100, 2);

    insert into public.invoice_lines (
      owner_id, invoice_id, product_id, position, description, quantity,
      unit_price, vat_rate, line_base, line_vat, line_total
    ) values (
      v_owner_id, v_invoice_id, v_product_id, v_position, v_line ->> 'description',
      v_quantity, v_unit_price, v_vat_rate, v_line_base, v_line_vat,
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

  v_number := v_year::text || '-' || lpad(v_last_number::text, 4, '0');

  update public.invoices set number = v_number, status = 'issued', issued_at = now()
  where id = p_invoice_id and owner_id = v_owner_id;
  return v_number;
end;
$$;

create or replace function public.mark_invoice_paid(p_invoice_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_status text;
begin
  if v_owner_id is null then
    raise exception 'NOT_FOUND';
  end if;

  select i.status into v_status from public.invoices as i
  where i.id = p_invoice_id and i.owner_id = v_owner_id
  for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_status <> 'issued' then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.invoices set status = 'paid', paid_at = now()
  where id = p_invoice_id and owner_id = v_owner_id;
end;
$$;

create or replace function public.cancel_invoice(p_invoice_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_status text;
  v_line record;
begin
  if v_owner_id is null then
    raise exception 'NOT_FOUND';
  end if;

  select i.status into v_status from public.invoices as i
  where i.id = p_invoice_id and i.owner_id = v_owner_id
  for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_status <> 'issued' then
    raise exception 'INVALID_TRANSITION';
  end if;

  for v_line in
    select l.product_id, l.quantity from public.invoice_lines as l
    where l.invoice_id = p_invoice_id and l.owner_id = v_owner_id
      and l.product_id is not null
    order by l.product_id, l.position, l.id
  loop
    update public.products set stock = stock + v_line.quantity
    where id = v_line.product_id and owner_id = v_owner_id;
  end loop;

  update public.invoices set status = 'cancelled', cancelled_at = now()
  where id = p_invoice_id and owner_id = v_owner_id;
end;
$$;

-- Functions grant EXECUTE to PUBLIC by default; revoke it explicitly.
revoke all on function public.save_draft_invoice(uuid, uuid, date, date, text, jsonb),
  public.issue_invoice(uuid), public.mark_invoice_paid(uuid), public.cancel_invoice(uuid)
  from public, anon, authenticated;
grant execute on function public.save_draft_invoice(uuid, uuid, date, date, text, jsonb),
  public.issue_invoice(uuid), public.mark_invoice_paid(uuid), public.cancel_invoice(uuid)
  to authenticated;

commit;
