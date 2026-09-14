import { db } from '../_lib/db.js';
import { json, readBody } from '../_lib/http.js';
import { adminConfigured, adminUser, checkCredentials, clientIp, sessionCookie } from '../_lib/auth.js';

const MAX_FAILS = 8; // intentos fallidos por conexión…
const WINDOW_MIN = 15; // …cada 15 minutos

// POST /api/admin/login { user, password }
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  if (!adminConfigured()) return json(res, 503, { error: 'no_configurado' });

  try {
    const sb = db();
    const ip = clientIp(req);
    const since = new Date(Date.now() - WINDOW_MIN * 60 * 1000).toISOString();
    const { count, error } = await sb.from('admin_logins')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip).eq('ok', false).gte('created_at', since);
    if (error) throw error;
    if ((count || 0) >= MAX_FAILS) return json(res, 429, { error: 'demasiados_intentos' });

    const { user, password } = readBody(req);
    const ok = checkCredentials(user, password);
    await sb.from('admin_logins').insert({ ip, ok });

    if (!ok) {
      await new Promise((r) => setTimeout(r, 700));
      return json(res, 401, { error: 'credenciales' });
    }
    res.setHeader('Set-Cookie', sessionCookie());
    return json(res, 200, { ok: true, user: adminUser() });
  } catch (err) {
    console.error('[admin/login]', err);
    return json(res, 500, { error: 'server' });
  }
}
