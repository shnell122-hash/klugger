'use strict';
// Comisiones por defecto (configurables desde DB/dashboard)
// Formato: codigo -> { pct: decimal, nombre: string, descripcion: string }

const DEFAULT_COMMISSIONS = {
  IAS:       { pct: 0.055, costo_pct: 0.030, nombre: 'IAS',       descripcion: 'Operación IAS' },
  TARJETAS:  { pct: 0.055, costo_pct: 0.030, nombre: 'Tarjetas',  descripcion: 'Pago con tarjeta' },
  SPEI:      { pct: 0.030, costo_pct: 0.030, nombre: 'SPEI',      descripcion: 'Transferencia SPEI' },
  EFECTIVO:  { pct: 0.030, costo_pct: 0.030, nombre: 'Efectivo',  descripcion: 'Entrega en efectivo' },
  SINDICATO: { pct: 0.055, costo_pct: 0.030, nombre: 'Sindicato', descripcion: 'Operación sindicato' },
};

// Cache en memoria de tasas globales (se recarga desde DB cada 5 min)
let _cache = { ...DEFAULT_COMMISSIONS };
let _lastLoaded = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function reloadFromDB(pool) {
  try {
    const [rows] = await pool.query(
      'SELECT codigo, nombre, comision_pct, costo_pct, descripcion FROM fin_operation_types WHERE is_active=1'
    );
    if (rows.length > 0) {
      _cache = {};
      for (const row of rows) {
        _cache[row.codigo] = {
          pct:      parseFloat(row.comision_pct),
          costo_pct: row.costo_pct != null ? parseFloat(row.costo_pct) : null,
          nombre:   row.nombre,
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
 * Retorna la comisión efectiva para un (tipo, cliente).
 *
 * Resolución (en orden):
 *   1. fin_client_models para (client_id, tipo)  → tasa personalizada o tipo bloqueado
 *   2. fin_operation_types global
 *   3. DEFAULT_COMMISSIONS en memoria
 *
 * Retorna null si el tipo está bloqueado para el cliente o no existe globalmente.
 * Retorna { pct, nombre, descripcion, es_credito } con el flag de crédito cuando aplica.
 *
 * @param {string} tipo
 * @param {object} [pool]
 * @param {number} [clientId]
 */
async function getCommission(tipo, pool, clientId) {
  const key = tipo?.toUpperCase();
  if (!key) return null;

  // Recargar tasas globales si el cache venció
  if (pool && Date.now() - _lastLoaded > CACHE_TTL_MS) {
    await reloadFromDB(pool);
  }

  // 1. Modelo por cliente (override o bloqueo)
  if (pool && clientId) {
    try {
      const [rows] = await pool.query(
        `SELECT comision_pct, es_credito, is_active
         FROM fin_client_models
         WHERE client_id = ? AND tipo_operacion = ?
         LIMIT 1`,
        [clientId, key]
      );
      if (rows.length > 0) {
        if (!rows[0].is_active) return null; // tipo bloqueado para este cliente
        return {
          pct:       parseFloat(rows[0].comision_pct),
          costo_pct: rows[0].costo_pct != null ? parseFloat(rows[0].costo_pct) : (_cache[key]?.costo_pct ?? null),
          nombre:    key,
          descripcion: '',
          es_credito: !!rows[0].es_credito,
        };
      }
    } catch (err) {
      console.error('[commissions] Error consultando fin_client_models:', err.message);
    }
  }

  // 2. Tasa global desde cache
  const global = _cache[key];
  if (!global) return null;
  return { ...global, es_credito: false };
}

/**
 * Lista los tipos disponibles (cache global).
 * Usar getClientModels para obtener la lista filtrada por cliente.
 */
function listTypes() {
  return Object.entries(_cache).map(([codigo, v]) => ({ codigo, ...v }));
}

/**
 * Retorna los modelos activos para un cliente específico.
 * Si no tiene overrides, devuelve todos los globales.
 * @param {number} clientId
 * @param {object} pool
 */
async function getClientModels(clientId, pool) {
  try {
    const [overrides] = await pool.query(
      `SELECT tipo_operacion, comision_pct, costo_pct, es_credito
       FROM fin_client_models
       WHERE client_id = ? AND is_active = 1`,
      [clientId]
    );
    if (overrides.length > 0) {
      return overrides.map(r => ({
        codigo:    r.tipo_operacion,
        pct:       parseFloat(r.comision_pct),
        costo_pct: r.costo_pct != null ? parseFloat(r.costo_pct) : null,
        es_credito: !!r.es_credito,
      }));
    }
  } catch (err) {
    console.error('[commissions] Error en getClientModels:', err.message);
  }
  return listTypes().map(t => ({ ...t, es_credito: false }));
}

/**
 * Registra la comisión del comisionista para una operación confirmada.
 * No lanza — falla silenciosamente con log para no interrumpir el flujo principal.
 * @param {object} params
 */
async function registrarComisionista({ pool, clientId, operationId, tipoOperacion, montoBruto }) {
  try {
    const [clientRows] = await pool.query(
      `SELECT c.comisionista_id
       FROM fin_clients c
       WHERE c.id = ?`,
      [clientId]
    );
    const comisionistaId = clientRows[0]?.comisionista_id;
    if (!comisionistaId) return; // cliente sin comisionista asignado

    const [rateRows] = await pool.query(
      `SELECT pct FROM fin_comisionista_rates
       WHERE comisionista_id = ? AND tipo_operacion = ?
       LIMIT 1`,
      [comisionistaId, tipoOperacion?.toUpperCase()]
    );
    if (!rateRows.length) return; // sin tasa configurada para este tipo

    const pct            = parseFloat(rateRows[0].pct);
    const montoComision  = Math.round(montoBruto * pct * 10000) / 10000;

    await pool.query(
      `INSERT INTO fin_comisiones
         (comisionista_id, client_id, operation_id, tipo_operacion, monto_base, pct, monto_comision)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE updated_at = updated_at`,
      [comisionistaId, clientId, operationId, tipoOperacion?.toUpperCase(),
       montoBruto, pct, montoComision]
    );
  } catch (err) {
    console.error('[commissions] Error registrando comisionista:', err.message);
  }
}

function detectType(text) {
  const t = text.toUpperCase();
  for (const codigo of Object.keys(_cache)) {
    if (t.includes(codigo)) return codigo;
  }
  if (/TARJETA|CARD/i.test(t))     return 'TARJETAS';
  if (/EFECTIVO|CASH|FISICO/i.test(t)) return 'EFECTIVO';
  if (/SPEI|TRANSFER|BANCO/i.test(t))  return 'SPEI';
  if (/SINDIC/i.test(t))               return 'SINDICATO';
  return null;
}

module.exports = {
  DEFAULT_COMMISSIONS,
  getCommission,
  listTypes,
  getClientModels,
  registrarComisionista,
  detectType,
  reloadFromDB,
};
