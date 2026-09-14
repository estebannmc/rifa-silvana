-- =====================================================================
-- Rifa a beneficio · esquema de Supabase
-- Tablas: orders (compras) y tickets (estado de cada número 0–200)
-- Solo las funciones de Vercel acceden, con la service role key.
-- =====================================================================

create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null check (char_length(nombre) between 2 and 80),
  telefono      text not null check (char_length(telefono) between 3 and 30),
  numbers       int[] not null check (cardinality(numbers) between 1 and 50),
  amount        int not null check (amount >= 0),
  method        text not null default 'mercadopago' check (method in ('mercadopago', 'transferencia', 'manual')),
  status        text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'cancelled')),
  mp_payment_id text,
  notified      boolean not null default false,
  note          text,
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);

create table public.tickets (
  number         int primary key check (number between 0 and 200),
  order_id       uuid references public.orders (id) on delete cascade,
  status         text not null check (status in ('reserved', 'sold')),
  reserved_until timestamptz,
  updated_at     timestamptz not null default now()
);
create index tickets_order_id_idx on public.tickets (order_id);
create index orders_status_idx on public.orders (status, created_at desc);

alter table public.orders  enable row level security;
alter table public.tickets enable row level security;
revoke all on public.orders, public.tickets from anon, authenticated;

-- ---------------------------------------------------------------------
-- Triggers: al pasar una orden a "paid" sus números quedan vendidos;
-- al cancelarla o vencerla se liberan sus reservas.
-- Así Silvana puede confirmar una transferencia cambiando el status
-- de la orden a "paid" desde el Table Editor.
-- ---------------------------------------------------------------------
create or replace function public.set_paid_at() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    new.paid_at := coalesce(new.paid_at, now());
  end if;
  return new;
end $$;

create or replace function public.sync_order_tickets() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    update tickets set status = 'sold', reserved_until = null, updated_at = now()
     where order_id = new.id;
    insert into tickets (number, order_id, status)
    select n, new.id, 'sold' from unnest(new.numbers) as n
    on conflict (number) do nothing;
  elsif tg_op = 'UPDATE' and new.status in ('cancelled', 'expired') and old.status in ('pending', 'paid') then
    delete from tickets where order_id = new.id;
  end if;
  return null;
end $$;

create trigger orders_set_paid_at
  before insert or update of status on public.orders
  for each row execute function public.set_paid_at();

create trigger orders_sync_tickets
  after insert or update of status on public.orders
  for each row execute function public.sync_order_tickets();

-- ---------------------------------------------------------------------
-- Libera reservas vencidas y marca sus órdenes como "expired"
-- ---------------------------------------------------------------------
create or replace function public.release_expired() returns void
language plpgsql security definer set search_path = public as $$
begin
  with gone as (
    delete from tickets
     where status = 'reserved' and reserved_until < now()
    returning order_id
  )
  update orders set status = 'expired'
   where id in (select order_id from gone) and status = 'pending';
end $$;

-- ---------------------------------------------------------------------
-- Reserva atómica: si algún número ya está tomado, falla con TAKEN:n,m
-- ---------------------------------------------------------------------
create or replace function public.reserve_numbers(
  p_numbers  int[],
  p_nombre   text,
  p_telefono text,
  p_amount   int,
  p_method   text,
  p_minutes  int
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_order uuid;
  v_taken int[];
begin
  perform release_expired();

  if p_numbers is null or cardinality(p_numbers) = 0 or cardinality(p_numbers) > 10
     or exists (select 1 from unnest(p_numbers) n where n is null or n < 0 or n > 200)
     or (select count(distinct n) from unnest(p_numbers) n) <> cardinality(p_numbers) then
    raise exception 'INVALID_NUMBERS';
  end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 1440 then
    raise exception 'INVALID_TTL';
  end if;

  select array_agg(number order by number) into v_taken
    from tickets where number = any (p_numbers);
  if v_taken is not null then
    raise exception 'TAKEN:%', array_to_string(v_taken, ',');
  end if;

  insert into orders (nombre, telefono, numbers, amount, method)
  values (p_nombre, p_telefono, p_numbers, p_amount, p_method)
  returning id into v_order;

  insert into tickets (number, order_id, status, reserved_until)
  select n, v_order, 'reserved', now() + make_interval(mins => p_minutes)
    from unnest(p_numbers) as n;

  return v_order;
exception
  when unique_violation then
    raise exception 'TAKEN:';
end $$;

-- ---------------------------------------------------------------------
-- Confirma un pago aprobado (idempotente). Devuelve conflictos si algún
-- número fue tomado por otra orden mientras la reserva estaba vencida.
-- ---------------------------------------------------------------------
create or replace function public.confirm_order(p_order uuid, p_payment_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_status    text;
  v_conflicts int[];
begin
  select status into v_status from orders where id = p_order for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_status = 'paid' then
    return jsonb_build_object('already_paid', true, 'conflicts', '[]'::jsonb);
  end if;

  update orders
     set status = 'paid', mp_payment_id = coalesce(p_payment_id, mp_payment_id)
   where id = p_order;

  select array_agg(t.number order by t.number) into v_conflicts
    from orders o
    cross join unnest(o.numbers) as n
    join tickets t on t.number = n
   where o.id = p_order and t.order_id is distinct from p_order;

  if v_conflicts is not null then
    update orders
       set note = 'CONFLICTO: números ya tomados por otra orden: ' || array_to_string(v_conflicts, ', ')
     where id = p_order;
  end if;

  return jsonb_build_object('already_paid', false, 'conflicts', coalesce(to_jsonb(v_conflicts), '[]'::jsonb));
end $$;

revoke all on function public.set_paid_at()                                  from public, anon, authenticated;
revoke all on function public.sync_order_tickets()                           from public, anon, authenticated;
revoke all on function public.release_expired()                              from public, anon, authenticated;
revoke all on function public.reserve_numbers(int[], text, text, int, text, int) from public, anon, authenticated;
revoke all on function public.confirm_order(uuid, text)                      from public, anon, authenticated;
grant execute on function public.release_expired()                              to service_role;
grant execute on function public.reserve_numbers(int[], text, text, int, text, int) to service_role;
grant execute on function public.confirm_order(uuid, text)                      to service_role;

-- ---------------------------------------------------------------------
-- Vista cómoda para Silvana (Table Editor). security_invoker => respeta RLS.
-- ---------------------------------------------------------------------
create view public.ventas with (security_invoker = true) as
select
  o.created_at::timestamp(0)                                        as fecha,
  o.nombre,
  o.telefono,
  (select string_agg(lpad(n::text, 2, '0'), ', ' order by n) from unnest(o.numbers) n) as numeros,
  o.amount                                                          as importe,
  o.method                                                          as medio,
  o.status                                                          as estado,
  o.note                                                            as nota,
  o.id                                                              as pedido
from public.orders o
order by o.created_at desc;
revoke all on public.ventas from anon, authenticated;

-- ---------------------------------------------------------------------
-- Seed: el 08 y el 27 ya estaban vendidos antes de la web
-- ---------------------------------------------------------------------
insert into public.orders (nombre, telefono, numbers, amount, method, status, notified, note)
values ('Venta previa', 'sin datos', array[8, 27], 10000, 'manual', 'paid', true, 'Números vendidos antes de lanzar la web');

-- =====================================================================
-- Panel de Silvana (/admin)
-- =====================================================================

-- Bloqueo manual: números vendidos por fuera de la web
create or replace function public.admin_block_numbers(
  p_numbers  int[],
  p_nombre   text,
  p_telefono text,
  p_amount   int,
  p_note     text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_order uuid;
  v_taken int[];
  v_count int;
begin
  perform release_expired();

  if p_numbers is null or cardinality(p_numbers) = 0 or cardinality(p_numbers) > 50
     or exists (select 1 from unnest(p_numbers) n where n is null or n < 0 or n > 200)
     or (select count(distinct n) from unnest(p_numbers) n) <> cardinality(p_numbers) then
    raise exception 'INVALID_NUMBERS';
  end if;

  select array_agg(number order by number) into v_taken
    from tickets where number = any (p_numbers);
  if v_taken is not null then
    raise exception 'TAKEN:%', array_to_string(v_taken, ',');
  end if;

  insert into orders (nombre, telefono, numbers, amount, method, status, notified, note)
  values (p_nombre, p_telefono, p_numbers, p_amount, 'manual', 'paid', true, p_note)
  returning id into v_order;

  select count(*) into v_count from tickets where order_id = v_order;
  if v_count <> cardinality(p_numbers) then
    raise exception 'TAKEN:';
  end if;

  return v_order;
end $$;

revoke all on function public.admin_block_numbers(int[], text, text, int, text) from public, anon, authenticated;
grant execute on function public.admin_block_numbers(int[], text, text, int, text) to service_role;

-- Intentos de ingreso al panel (para frenar adivinanzas de contraseña)
create table public.admin_logins (
  id         bigint generated always as identity primary key,
  ip         text not null,
  ok         boolean not null,
  created_at timestamptz not null default now()
);
create index admin_logins_ip_idx on public.admin_logins (ip, created_at desc);
alter table public.admin_logins enable row level security;
revoke all on public.admin_logins from anon, authenticated;
