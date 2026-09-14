import { db } from './_lib/db.js';
import { json } from './_lib/http.js';
import { getPayment } from './_lib/mp.js';
import { confirmFromPayment } from './_lib/confirm.js';
import { UUID_RE } from './_lib/config.js';

// GET /api/order?id=<uuid>&payment_id=<id>
// Estado de la orden para la pantalla de vuelta. Si el webhook todavía no llegó,
// confirma consultando el pago a Mercado Pago.
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  const id = String(req.query?.id || '');
  const paymentId = String(req.query?.payment_id || '').replace(/\D/g, '');
  if (!UUID_RE.test(id)) return json(res, 400, { error: 'id_invalido' });

  try {
    const { data: order, error } = await db()
      .from('orders')
      .select('id, status, numbers, amount, nombre, telefono, method')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!order) return json(res, 404, { error: 'no_encontrada' });

    let status = order.status;
    let paymentStatus = null;
    if (status !== 'paid' && paymentId && order.method === 'mercadopago') {
      const payment = await getPayment(paymentId);
      paymentStatus = payment.status;
      if (payment.external_reference === id) {
        const result = await confirmFromPayment(payment);
        if (result.ok) status = 'paid';
      }
    }

    return json(res, 200, {
      status,
      paymentStatus,
      numbers: order.numbers,
      amount: order.amount,
      nombre: order.nombre,
      telefono: order.telefono,
    });
  } catch (err) {
    console.error('[order]', err);
    return json(res, 500, { error: 'server' });
  }
}
