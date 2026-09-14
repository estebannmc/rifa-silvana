import { db } from './_lib/db.js';
import { json, readBody } from './_lib/http.js';
import {
  TRANSFER_RESERVE_MIN, RESERVE_HOLD_MIN, parseNumbers, priceFor,
} from './_lib/config.js';

// POST /api/checkout { numbers, nombre, telefono, method }
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  const body = readBody(req);
  const numbers = parseNumbers(body.numbers);
  const nombre = String(body.nombre || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const telefono = String(body.telefono || '').replace(/[^\d+]/g, '').slice(0, 20);
  const method = body.method === 'reserva' ? 'reserva' : 'transferencia';

  if (!numbers) return json(res, 400, { error: 'numeros_invalidos' });
  if (nombre.length < 3) return json(res, 400, { error: 'nombre_invalido' });
  if (telefono.replace(/\D/g, '').length < 8) return json(res, 400, { error: 'telefono_invalido' });

  const amount = priceFor(numbers.length);
  const minutes = method === 'reserva' ? RESERVE_HOLD_MIN : TRANSFER_RESERVE_MIN;
  const sb = db();

  try {
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

    return json(res, 200, { orderId, amount, numbers });
  } catch (err) {
    console.error('[checkout]', err);
    return json(res, 500, { error: 'server' });
  }
}
