import crypto from 'node:crypto';

const API = 'https://api.mercadopago.com';

function token() {
  const t = process.env.MP_ACCESS_TOKEN;
  if (!t) throw new Error('Falta MP_ACCESS_TOKEN');
  return t;
}

async function call(path, { method = 'GET', body, idempotencyKey } = {}) {
  const headers = { Authorization: `Bearer ${token()}` };
  if (body) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;
  const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Mercado Pago ${method} ${path} → ${r.status}: ${JSON.stringify(data)}`);
  return data;
}

export const createPreference = (pref, idempotencyKey) =>
  call('/checkout/preferences', { method: 'POST', body: pref, idempotencyKey });

export const getPayment = (id) => call(`/v1/payments/${encodeURIComponent(id)}`);

/**
 * Valida la cabecera x-signature de los webhooks de Mercado Pago.
 * Manifest: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" firmado con HMAC-SHA256.
 * Si MP_WEBHOOK_SECRET no está configurado, no se valida (igual se consulta el pago a la API).
 */
export function verifySignature(req, dataId) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true;
  const header = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'];
  if (!header) return false;

  const parts = {};
  for (const piece of String(header).split(',')) {
    const [k, v] = piece.split('=').map((s) => s && s.trim());
    if (k && v) parts[k] = v;
  }
  if (!parts.ts || !parts.v1) return false;

  let manifest = '';
  if (dataId) manifest += `id:${String(dataId).toLowerCase()};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${parts.ts};`;

  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
