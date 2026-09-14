import { db } from './_lib/db.js';
import { json } from './_lib/http.js';

// GET /api/numbers → { sold: [...], reserved: [...] }
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  try {
    const { data, error } = await db().from('tickets').select('number, status, reserved_until');
    if (error) throw error;

    const now = Date.now();
    const sold = [];
    const reserved = [];
    for (const t of data) {
      if (t.status === 'sold') sold.push(t.number);
      else if (t.reserved_until && new Date(t.reserved_until).getTime() > now) reserved.push(t.number);
    }
    sold.sort((a, b) => a - b);
    reserved.sort((a, b) => a - b);
    return json(res, 200, { sold, reserved, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[numbers]', err);
    return json(res, 500, { error: 'server' });
  }
}
