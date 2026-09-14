// Reglas de la rifa (espejo de app.js; el servidor es la fuente de verdad)
export const MIN = 0;
export const MAX = 200;
export const PRICE_ONE = 6000;
export const PRICE_TWO = 10000;
export const MAX_PER_ORDER = 10;
export const TRANSFER_RESERVE_MIN = 12 * 60; // reserva hasta que Silvana verifique la transferencia
export const RESERVE_HOLD_MIN = 24 * 60; // reserva sin pago inmediato, para bloquear el número

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const pad = (n) => (n < 100 ? String(n).padStart(2, '0') : String(n));
export const money = (n) => '$' + Number(n).toLocaleString('es-AR');
export const priceFor = (n) => Math.floor(n / 2) * PRICE_TWO + (n % 2) * PRICE_ONE;

/** Valida la lista de números: enteros únicos en rango, 1..MAX_PER_ORDER. Devuelve el array ordenado o null. */
export function parseNumbers(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_PER_ORDER) return null;
  const nums = input.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < MIN || n > MAX)) return null;
  if (new Set(nums).size !== nums.length) return null;
  return nums.sort((a, b) => a - b);
}
