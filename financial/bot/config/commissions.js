'use strict';
// Comisiones por defecto (configurables desde DB/dashboard)
// Formato: codigo -> { pct: decimal, nombre: string, descripcion: string }

const DEFAULT_COMMISSIONS = {
  IAS:       { pct: 0.055, nombre: 'IAS',       descripcion: 'Operación IAS' },
  TARJETAS:  { pct: 0.055, nombre: 'Tarjetas',  descripcion: 'Pago con tarjeta' },
  SPEI:      { pct: 0.030, nombre: 'SPEI',      descripcion: 'Transferencia SPEI' },
  EFECTIVO:  { pct: 0.030, nombre: 'Efectivo',  descripcion: 'Entrega en efectivo' },
  SINDICATO: { pct: 0.055, nombre: 'Sindicato', descripcion: 'Operación sindicato' },
};

// Cache en memoria (se recarga desde DB cada 5 min)
let _cache = { ...DEFAULT_COMMISSIONS };
let _lastLoaded = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Recarga comisiones desde la base de datos.
 * @param {import('../../../backend/db/mysql.js')} pool
 */
async function reloadFromDB(pool) {
  try {
    const [rows] = await pool.query(
      'SELECT codigo, nombre, comision_pct, descripcion FROM fin_operation_types WHERE is_active=1'
    );
    if (rows.length > 0) {
      _cache = {};
      for (const row of rows) {
        _cache[row.codigo] = {
          pct: parseFloat(row.comision_pct),
          nombre: row.nombre,
          descripcion: row.descripcion,
        };
      }
    }
    _lastLoaded = Date.now();
  } catch (err) {
    console.error('[commissions] Error recargando desde DB:', err.message);
  }
}

/**
 * Retorna la comisión para un tipo de operación.
 * @param {string} tipo
 * @param {import('../../../backend/db/mysql.js')} [pool]
 * @returns {Promise<{pct: number, nombre: string, descripcion: string}|null>}
 */
async function getCommission(tipo, pool) {
  const key = tipo.toUpperCase();
  if (pool && Date.now() - _lastLoaded > CACHE_TTL_MS) {
    await reloadFromDB(pool);
  }
  return _cache[key] ?? null;
}

/**
 * Lista todos los tipos de operación disponibles.
 */
function listTypes() {
  return Object.entries(_cache).map(([codigo, v]) => ({ codigo, ...v }));
}

/**
 * Detecta el tipo de operación desde texto libre.
 * Retorna el codigo (IAS, SPEI, etc.) o null.
 */
function detectType(text) {
  const t = text.toUpperCase();
  for (const codigo of Object.keys(_cache)) {
    if (t.includes(codigo)) return codigo;
  }
  // Alias comunes
  if (/TARJETA|CARD/i.test(t)) return 'TARJETAS';
  if (/EFECTIVO|CASH|FISICO/i.test(t)) return 'EFECTIVO';
  if (/SPEI|TRANSFER|BANCO/i.test(t)) return 'SPEI';
  if (/SINDIC/i.test(t)) return 'SINDICATO';
  return null;
}

module.exports = { DEFAULT_COMMISSIONS, getCommission, listTypes, detectType, reloadFromDB };
