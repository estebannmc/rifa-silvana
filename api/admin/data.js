import { db } from '../_lib/db.js';
import { json } from '../_lib/http.js';
import { isAdmin } from '../_lib/auth.js';
import { MIN, MAX } from '../_lib/config.js';

// GET /api/admin/data → pedidos pendientes, ventas y estado de la grilla
export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  if (!isAdmin(req)) return json(res, 401, { error: 'no_autorizado' });

  try {
    const sb = db();
    await sb.rpc('release_expired');
    const [ordersRes, ticketsRes] = await Promise.all([
      sb.from('orders')
        .select('id, nombre, telefono, numbers, amount, method, status, note, created_at, paid_at')
        .in('status', ['pending', 'paid'])
        .order('created_at', { ascending: false })
        .limit(1000),
      sb.from('tickets').select('number, status, reserved_until, order_id'),
    ]);
    if (ordersRes.error) throw ordersRes.error;
    if (ticketsRes.error) throw ticketsRes.error;

    const orders = ordersRes.data;
    const tickets = ticketsRes.data;
    const reservedUntil = {};
    for (const t of tickets) if (t.status === 'reserved') reservedUntil[t.order_id] = t.reserved_until;

    const withUntil = (o) => ({ ...o, reserved_until: reservedUntil[o.id] || null });
    const pendingOrders = orders.filter((o) => o.status === 'pending').map(withUntil);
    const sales = orders.filter((o) => o.status === 'paid');

    const sold = tickets.filter((t) => t.status === 'sold').map((t) => t.number).sort((a, b) => a - b);
    const reserved = tickets.filter((t) => t.status === 'reserved').map((t) => t.number).sort((a, b) => a - b);
    const total = MAX - MIN + 1;

    return json(res, 200, {
      pendingOrders,
      sales,
      sold,
      reserved,
      stats: {
        total,
        sold: sold.length,
        reserved: reserved.length,
        free: total - sold.length - reserved.length,
        raised: sales.reduce((sum, o) => sum + o.amount, 0),
      },
    });
  } catch (err) {
    console.error('[admin/data]', err);
    return json(res, 500, { error: 'server' });
  }
}
