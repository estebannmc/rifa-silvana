import { db } from '../_lib/db.js';
import { json, readBody } from '../_lib/http.js';
import { isAdmin } from '../_lib/auth.js';
import { UUID_RE, MIN, MAX, priceFor } from '../_lib/config.js';

const clean = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

// Cambios de estado de un pedido: de → a
const TRANSITIONS = {
  confirm: { from: 'pending', to: 'paid', note: null }, // transferencia recibida
  release: { from: 'pending', to: 'cancelled', note: 'Liberado desde el panel' }, // no llegó la transferencia
  void: { from: 'paid', to: 'cancelled', note: 'Anulado desde el panel' }, // venta con error o devuelta
};

// POST /api/admin/action { action, id } | { action: 'block', numbers, nombre?, telefono?, amount? }
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  if (!isAdmin(req)) return json(res, 401, { error: 'no_autorizado' });

  const body = readBody(req);
  const sb = db();

  try {
    if (body.action === 'block') {
      const numbers = Array.isArray(body.numbers) ? body.numbers.map(Number) : [];
      const valid = numbers.length > 0 && numbers.length <= 50
        && numbers.every((n) => Number.isInteger(n) && n >= MIN && n <= MAX)
        && new Set(numbers).size === numbers.length;
      if (!valid) return json(res, 400, { error: 'numeros_invalidos' });

      const amount = Number.isInteger(body.amount) && body.amount >= 0 && body.amount <= 10_000_000
        ? body.amount
        : priceFor(numbers.length);
      const nombre = clean(body.nombre, 80);
      const telefono = clean(body.telefono, 30);

      const { data: orderId, error } = await sb.rpc('admin_block_numbers', {
        p_numbers: numbers.sort((a, b) => a - b),
        p_nombre: nombre.length >= 2 ? nombre : 'Venta por fuera',
        p_telefono: telefono.length >= 3 ? telefono : 'sin datos',
        p_amount: amount,
        p_note: 'Bloqueado desde el panel',
      });
      if (error) {
        const taken = /TAKEN:([\d,]*)/.exec(error.message || '');
        if (taken) return json(res, 409, { error: 'taken', numbers: taken[1] ? taken[1].split(',').map(Number) : [] });
        throw error;
      }
      return json(res, 200, { ok: true, orderId });
    }

    const t = TRANSITIONS[body.action];
    if (!t) return json(res, 400, { error: 'accion_invalida' });
    if (!UUID_RE.test(String(body.id || ''))) return json(res, 400, { error: 'id_invalido' });

    const patch = { status: t.to };
    if (t.note) patch.note = t.note;
    const { data, error } = await sb.from('orders')
      .update(patch)
      .eq('id', body.id)
      .eq('status', t.from)
      .select('id, numbers')
      .maybeSingle();
    if (error) throw error;
    if (!data) return json(res, 409, { error: 'estado_cambiado' });
    return json(res, 200, { ok: true, numbers: data.numbers });
  } catch (err) {
    console.error('[admin/action]', err);
    return json(res, 500, { error: 'server' });
  }
}
