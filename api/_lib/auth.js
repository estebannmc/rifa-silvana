import crypto from 'node:crypto';

// Sesión del panel: cookie HttpOnly firmada con HMAC (sin estado en el servidor)
const COOKIE = 'rifa_admin';
const MAX_AGE = 12 * 60 * 60; // 12 h

export const adminUser = () => process.env.ADMIN_USER || 'Silvana';
export const adminConfigured = () => Boolean(process.env.ADMIN_PASSWORD && process.env.SUPABASE_SERVICE_ROLE_KEY);

// Cambiar ADMIN_PASSWORD invalida todas las sesiones abiertas
function secret() {
  return crypto.createHash('sha256')
    .update(`rifa-admin:${process.env.SUPABASE_SERVICE_ROLE_KEY}:${process.env.ADMIN_PASSWORD}`)
    .digest();
}

const sign = (payload) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Usuario sin distinguir mayúsculas; contraseña exacta. */
export function checkCredentials(user, password) {
  if (!adminConfigured()) return false;
  const okUser = safeEqual(String(user || '').trim().toLowerCase(), adminUser().toLowerCase());
  const okPass = safeEqual(String(password || ''), process.env.ADMIN_PASSWORD);
  return okUser && okPass;
}

export function sessionCookie() {
  const payload = Buffer.from(JSON.stringify({ u: adminUser(), exp: Date.now() + MAX_AGE * 1000 })).toString('base64url');
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export function isAdmin(req) {
  if (!adminConfigured()) return false;
  const raw = String(req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return false;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!payload || !sig) return false;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return Number(exp) > Date.now();
  } catch {
    return false;
  }
}

export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'desconocida';
}
