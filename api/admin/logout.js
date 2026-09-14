import { json } from '../_lib/http.js';
import { clearCookie } from '../_lib/auth.js';

// POST /api/admin/logout
export default function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  res.setHeader('Set-Cookie', clearCookie());
  return json(res, 200, { ok: true });
}
