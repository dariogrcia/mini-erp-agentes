-- D11: optimistic concurrency for customers and products.
-- The edit forms send the `updated_at` they read and the UPDATE filters on it;
-- this trigger bumps the value on every update, so a stale form affects 0 rows.
begin;

alter table public.customers
  add column if not exists updated_at timestamptz not null default now();
alter table public.products
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Always server time: a client cannot set or keep an old version on purpose.
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

commit;
