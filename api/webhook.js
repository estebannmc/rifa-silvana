import { json, readBody } from './_lib/http.js';
import { getPayment, verifySignature } from './_lib/mp.js';
import { confirmFromPayment } from './_lib/confirm.js';

// POST /api/webhook  ← notificaciones de Mercado Pago
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 200, { ok: true });

  const q = req.query || {};
  const body = readBody(req);
  const isIpn = Boolean(q.topic); // formato viejo: ?topic=payment&id=123 (sin firma)
  const type = q.type || q.topic || body.type || body.topic;
  const dataId = q['data.id'] || body?.data?.id || q.id;

  if (type !== 'payment' || !dataId) return json(res, 200, { ignored: true });
  if (!isIpn && !verifySignature(req, q['data.id'] || body?.data?.id)) {
    return json(res, 401, { error: 'firma_invalida' });
  }

  try {
    // La fuente de verdad es siempre la API de Mercado Pago, nunca el cuerpo del webhook
    const payment = await getPayment(dataId);
    const result = await confirmFromPayment(payment);
    return json(res, 200, { ok: true, result: result.ok ? 'confirmado' : result.reason });
  } catch (err) {
    console.error('[webhook]', err);
    return json(res, 500, { error: 'server' }); // Mercado Pago reintenta
  }
}
