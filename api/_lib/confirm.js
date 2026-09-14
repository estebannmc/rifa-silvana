import { db } from './db.js';
import { UUID_RE } from './config.js';

/**
 * Confirma la orden asociada a un pago de Mercado Pago ya consultado a la API.
 * Solo confirma si el pago está aprobado y el monto coincide. Idempotente.
 */
export async function confirmFromPayment(payment) {
  const orderId = payment?.external_reference;
  if (!orderId || !UUID_RE.test(orderId)) return { ok: false, reason: 'sin_referencia' };

  const sb = db();
  const { data: order, error } = await sb.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (error) throw error;
  if (!order) return { ok: false, reason: 'orden_inexistente' };
  if (payment.status !== 'approved') return { ok: false, reason: payment.status, order };

  if (Math.round(Number(payment.transaction_amount)) !== order.amount) {
    console.error('[confirm] monto distinto', { orderId, esperado: order.amount, pagado: payment.transaction_amount });
    // Queda anotado para que Silvana lo vea en la vista "ventas"
    await sb.from('orders')
      .update({ note: `MONTO DISTINTO: pago MP #${payment.id} por $${payment.transaction_amount}` })
      .eq('id', orderId);
    return { ok: false, reason: 'monto_distinto', order };
  }

  const { data: result, error: rpcError } = await sb.rpc('confirm_order', {
    p_order: orderId,
    p_payment_id: String(payment.id),
  });
  if (rpcError) throw rpcError;

  return { ok: true, order: { ...order, status: 'paid' }, conflicts: result?.conflicts || [] };
}
