import { db } from './_lib/db.js';
import { json, readBody, siteUrl } from './_lib/http.js';
import { createPreference } from './_lib/mp.js';
import {
  UUID_RE, MP_RESERVE_MIN, TRANSFER_RESERVE_MIN, parseNumbers, priceFor, pad,
} from './_lib/config.js';

// POST /api/checkout { numbers, nombre, telefono, method, replaceOrder? }
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  const body = readBody(req);
  const numbers = parseNumbers(body.numbers);
  const nombre = String(body.nombre || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const telefono = String(body.telefono || '').replace(/[^\d+]/g, '').slice(0, 20);
  const method = body.method === 'transferencia' ? 'transferencia' : 'mercadopago';

  if (!numbers) return json(res, 400, { error: 'numeros_invalidos' });
  if (nombre.length < 3) return json(res, 400, { error: 'nombre_invalido' });
  if (telefono.replace(/\D/g, '').length < 8) return json(res, 400, { error: 'telefono_invalido' });

  const amount = priceFor(numbers.length);
  const minutes = method === 'mercadopago' ? MP_RESERVE_MIN : TRANSFER_RESERVE_MIN;
  const sb = db();

  try {
    // Si la persona vuelve a intentar, liberamos su reserva anterior de MP (el id solo lo conoce su navegador)
    if (typeof body.replaceOrder === 'string' && UUID_RE.test(body.replaceOrder)) {
      await sb.from('orders').update({ status: 'cancelled' })
        .eq('id', body.replaceOrder).eq('status', 'pending').eq('method', 'mercadopago');
    }

    const { data: orderId, error } = await sb.rpc('reserve_numbers', {
      p_numbers: numbers,
      p_nombre: nombre,
      p_telefono: telefono,
      p_amount: amount,
      p_method: method,
      p_minutes: minutes,
    });
    if (error) {
      const taken = /TAKEN:([\d,]*)/.exec(error.message || '');
      if (taken) {
        const nums = taken[1] ? taken[1].split(',').map(Number) : [];
        return json(res, 409, { error: 'taken', numbers: nums });
      }
      if (/INVALID_NUMBERS/.test(error.message || '')) return json(res, 400, { error: 'numeros_invalidos' });
      throw error;
    }

    if (method === 'transferencia') return json(res, 200, { orderId, amount, numbers });

    const site = siteUrl(req);
    const now = new Date();
    const expires = new Date(now.getTime() + minutes * 60 * 1000);
    const label = numbers.length === 1 ? 'número' : 'números';
    try {
      const pref = await createPreference({
        items: [{
          id: 'rifa-beneficio',
          title: `Rifa a beneficio · ${label} ${numbers.map(pad).join(', ')}`,
          description: 'Premio: 1 lechón + 2 vinos + 1 torta de hojaldre',
          category_id: 'tickets',
          quantity: 1,
          unit_price: amount,
          currency_id: 'ARS',
        }],
        payer: { name: nombre },
        external_reference: orderId,
        metadata: { order_id: orderId, numbers },
        back_urls: {
          success: `${site}/?pago=ok`,
          failure: `${site}/?pago=error`,
          pending: `${site}/?pago=pendiente`,
        },
        auto_return: 'approved',
        notification_url: `${site}/api/webhook`,
        statement_descriptor: 'RIFA BENEFICIO',
        payment_methods: { excluded_payment_types: [{ id: 'ticket' }], installments: 1 },
        expires: true,
        expiration_date_from: now.toISOString(),
        expiration_date_to: expires.toISOString(),
      }, orderId);
      return json(res, 200, { orderId, amount, init_point: pref.init_point });
    } catch (mpErr) {
      console.error('[checkout] Mercado Pago', mpErr);
      await sb.from('orders').update({ status: 'cancelled' }).eq('id', orderId).eq('status', 'pending');
      return json(res, 502, { error: 'mercadopago' });
    }
  } catch (err) {
    console.error('[checkout]', err);
    return json(res, 500, { error: 'server' });
  }
}
