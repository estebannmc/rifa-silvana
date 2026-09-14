-- =====================================================================
-- Migración: sacar Mercado Pago, dejar transferencia + reserva 24 h.
-- Ejecutar una sola vez en el SQL Editor de Supabase (proyecto rifa-silvana).
-- Seguro de correr aunque ya no haya pedidos con method = 'mercadopago'.
-- =====================================================================

-- Por las dudas, cualquier pedido pendiente de Mercado Pago pasa a transferencia
-- antes de que la restricción deje de permitir 'mercadopago'.
update public.orders set method = 'transferencia' where method = 'mercadopago';

alter table public.orders drop constraint if exists orders_method_check;
alter table public.orders add constraint orders_method_check
  check (method in ('transferencia', 'reserva', 'manual'));

alter table public.orders drop column if exists mp_payment_id;

drop function if exists public.confirm_order(uuid, text);
