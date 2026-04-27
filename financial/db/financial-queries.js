'use strict';
/**
 * Queries financieras centralizadas para las rutas Express del dashboard.
 * Todas las queries retornan arrays planos listos para JSON.
 */

/** Resumen de clientes con saldo */
async function getClientSummary(pool, limit = 50) {
  const [rows] = await pool.query(
    `SELECT id, telegram_user_id, telegram_username, nombre,
            saldo, saldo_pendiente, total_operaciones, ops_completadas,
            ops_pendientes, total_entrada, total_salida, ultima_operacion
     FROM fin_client_summary
     ORDER BY saldo DESC
     LIMIT ?`,
    [limit]
  );
  return rows;
}

/** Operaciones con filtros */
async function getOperations(pool, { clientId, estado, fechaDesde, fechaHasta, limit = 100, offset = 0 } = {}) {
  const where = ['1=1'];
  const params = [];

  if (clientId)   { where.push('client_id = ?');           params.push(clientId); }
  if (estado)     { where.push('estado = ?');               params.push(estado); }
  if (fechaDesde) { where.push('created_at >= ?');          params.push(fechaDesde); }
  if (fechaHasta) { where.push('created_at <= ?');          params.push(fechaHasta); }

  const [rows] = await pool.query(
    `SELECT * FROM fin_operations_full
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return rows;
}

/** KPIs del dashboard */
async function getDashboardKPIs(pool) {
  const [rows] = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM fin_clients WHERE is_active=1)                           AS total_clientes,
      (SELECT SUM(saldo) FROM fin_clients WHERE is_active=1)                         AS saldo_total_clientes,
      (SELECT COUNT(*) FROM fin_operations WHERE DATE(created_at) = CURDATE())       AS ops_hoy,
      (SELECT SUM(monto_bruto) FROM fin_operations
         WHERE DATE(created_at) = CURDATE() AND estado NOT IN ('cancelada'))         AS volumen_hoy,
      (SELECT SUM(monto_bruto - monto_neto) FROM fin_operations
         WHERE DATE(created_at) = CURDATE() AND estado NOT IN ('cancelada'))         AS comisiones_hoy,
      (SELECT COUNT(*) FROM fin_operations WHERE estado = 'pendiente')               AS ops_pendientes,
      (SELECT SUM(cost_usd) FROM fin_llm_usage
         WHERE DATE(created_at) = CURDATE())                                         AS costo_llm_hoy,
      (SELECT SUM(cost_usd) FROM fin_llm_usage
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY))                       AS costo_llm_30d
  `);
  return rows[0];
}

/** Serie de tiempo: volumen diario (últimos N días) */
async function getVolumeTimeSeries(pool, days = 30) {
  const [rows] = await pool.query(
    `SELECT DATE(created_at) AS fecha,
            COUNT(*) AS total_ops,
            SUM(monto_bruto) AS volumen_bruto,
            SUM(monto_neto)  AS volumen_neto,
            SUM(monto_bruto - monto_neto) AS comisiones
     FROM fin_operations
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       AND estado NOT IN ('cancelada', 'draft')
     GROUP BY DATE(created_at)
     ORDER BY fecha ASC`,
    [days]
  );
  return rows;
}

/** Distribución por tipo de operación */
async function getOpsByType(pool, days = 30) {
  const [rows] = await pool.query(
    `SELECT tipo_operacion,
            COUNT(*) AS total,
            SUM(monto_bruto) AS volumen,
            SUM(monto_bruto - monto_neto) AS comisiones,
            AVG(comision_pct) AS comision_pct_avg
     FROM fin_operations
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       AND estado NOT IN ('cancelada', 'draft')
     GROUP BY tipo_operacion
     ORDER BY volumen DESC`,
    [days]
  );
  return rows;
}

/** Saldo por cliente a lo largo del tiempo (para gráfico de líneas) */
async function getBalanceHistory(pool, clientId, limit = 50) {
  const [rows] = await pool.query(
    `SELECT created_at, tipo_movimiento, monto, saldo_despues AS saldo, descripcion
     FROM fin_balance_history
     WHERE client_id = ?
     ORDER BY created_at ASC
     LIMIT ?`,
    [clientId, limit]
  );
  return rows;
}

/** Costos LLM por agente */
async function getLLMCostsByAgent(pool, days = 30) {
  const [rows] = await pool.query(
    `SELECT agent_name, model, provider,
            SUM(tokens_in) AS total_tokens_in,
            SUM(tokens_out) AS total_tokens_out,
            SUM(cost_usd) AS total_cost_usd,
            COUNT(*) AS total_calls,
            AVG(duration_ms) AS avg_duration_ms
     FROM fin_llm_usage
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY agent_name, model, provider
     ORDER BY total_cost_usd DESC`,
    [days]
  );
  return rows;
}

/** Serie de tiempo de costos LLM */
async function getLLMCostTimeSeries(pool, days = 30) {
  const [rows] = await pool.query(
    `SELECT DATE(created_at) AS fecha,
            SUM(cost_usd) AS total_cost_usd,
            SUM(tokens_in + tokens_out) AS total_tokens,
            COUNT(*) AS total_calls
     FROM fin_llm_usage
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY DATE(created_at)
     ORDER BY fecha ASC`,
    [days]
  );
  return rows;
}

/** Obtener tipos de operación configurados */
async function getOperationTypes(pool) {
  const [rows] = await pool.query(
    'SELECT * FROM fin_operation_types WHERE is_active=1 ORDER BY codigo'
  );
  return rows;
}

/** Actualizar tipo de operación (comisión y/o instrucciones de pago) */
async function updateOperationType(pool, codigo, { comision_pct, instrucciones_pago } = {}) {
  const sets = [];
  const params = [];
  if (comision_pct !== undefined)       { sets.push('comision_pct=?');       params.push(comision_pct); }
  if (instrucciones_pago !== undefined) { sets.push('instrucciones_pago=?'); params.push(instrucciones_pago); }
  if (!sets.length) return;
  sets.push('updated_at=NOW(3)');
  params.push(codigo);
  await pool.query(
    `UPDATE fin_operation_types SET ${sets.join(', ')} WHERE codigo=?`,
    params
  );
}

/** Cuentas bancarias de un cliente */
async function getBankingAccountsByClient(pool, clientId) {
  const [rows] = await pool.query(
    `SELECT * FROM fin_banking_accounts
     WHERE client_id = ? AND is_active = 1
     ORDER BY created_at DESC`,
    [clientId]
  );
  return rows;
}

/** Todas las cuentas bancarias con info de cliente */
async function getAllBankingAccounts(pool, limit = 200, offset = 0) {
  const [rows] = await pool.query(
    `SELECT b.*, c.nombre AS client_nombre, c.telegram_username
     FROM fin_banking_accounts b
     JOIN fin_clients c ON c.id = b.client_id
     WHERE b.is_active = 1
     ORDER BY b.created_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return rows;
}

/** Lista de chats con info de cliente y último mensaje */
async function getChatList(pool, limit = 100) {
  const [rows] = await pool.query(
    `SELECT fc.*, c.nombre AS client_nombre, c.saldo, c.saldo_neto,
            (SELECT texto FROM fin_messages
             WHERE chat_id=fc.chat_id AND es_bot=0
             ORDER BY created_at DESC LIMIT 1) AS ultimo_texto
     FROM fin_chats fc
     LEFT JOIN fin_clients c ON c.id = fc.client_id
     ORDER BY fc.ultimo_msg_at DESC
     LIMIT ?`,
    [limit]
  );
  return rows;
}

/** Mensajes de un chat (paginados, más recientes primero) */
async function getChatMessages(pool, chatId, limit = 50, offset = 0) {
  const [rows] = await pool.query(
    `SELECT * FROM fin_messages
     WHERE chat_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [chatId, limit, offset]
  );
  return rows.reverse();
}

/** Listar confirmaciones de pago (últimas N, opcionalmente filtradas por cliente) */
async function getPaymentConfirmations(pool, { clientId, estado, limit = 100, offset = 0 } = {}) {
  const where  = ['1=1'];
  const params = [];
  if (clientId) { where.push('pc.client_id = ?'); params.push(clientId); }
  if (estado)   { where.push('pc.estado = ?');    params.push(estado); }
  const [rows] = await pool.query(
    `SELECT pc.*, c.nombre AS client_nombre, c.telegram_username
     FROM fin_payment_confirmations pc
     JOIN fin_clients c ON c.id = pc.client_id
     WHERE ${where.join(' AND ')}
     ORDER BY pc.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return rows;
}

/** Confirmar pago manualmente desde el dashboard (admin) */
async function confirmarPagoAdmin(pool, clientId, { monto, tipo_operacion, notas, adminId }) {
  // Reutiliza BalanceManager para consistencia
  const BalanceManager = require('../bot/agents/balance-manager');
  const bm = new BalanceManager(pool);
  return bm.confirmarPago({
    clientId,
    monto,
    tipo: 'manual',
    tipo_operacion: tipo_operacion ?? null,
    notas: notas ?? `Ajuste manual por admin ${adminId ?? 'dashboard'}`,
  });
}

// ── Comisionistas ─────────────────────────────────────────────────────────────

async function getComisionistas(pool) {
  const [rows] = await pool.query(`
    SELECT c.*, COUNT(r.id) AS total_rates
    FROM fin_comisionistas c
    LEFT JOIN fin_comisionista_rates r ON r.comisionista_id = c.id
    GROUP BY c.id ORDER BY c.nombre`);
  return rows;
}

async function createComisionista(pool, { nombre, telegram_user_id, email, notas }) {
  const [res] = await pool.query(
    `INSERT INTO fin_comisionistas (nombre, telegram_user_id, email, notas) VALUES (?,?,?,?)`,
    [nombre, telegram_user_id ?? null, email ?? null, notas ?? null]
  );
  return res.insertId;
}

async function updateComisionista(pool, id, fields) {
  const map = { nombre: 'nombre', telegram_user_id: 'telegram_user_id', email: 'email', notas: 'notas', is_active: 'is_active' };
  const sets = []; const params = [];
  for (const [k, col] of Object.entries(map)) {
    if (fields[k] !== undefined) { sets.push(`${col}=?`); params.push(k === 'is_active' ? (fields[k] ? 1 : 0) : fields[k]); }
  }
  if (!sets.length) return;
  params.push(id);
  await pool.query(`UPDATE fin_comisionistas SET ${sets.join(',')},updated_at=NOW(3) WHERE id=?`, params);
}

async function getComisionistaRates(pool, comisionistaId) {
  const [rows] = await pool.query(
    `SELECT * FROM fin_comisionista_rates WHERE comisionista_id=? ORDER BY tipo_operacion`,
    [comisionistaId]
  );
  return rows;
}

async function upsertComisionistaRates(pool, comisionistaId, rates) {
  for (const r of rates) {
    await pool.query(
      `INSERT INTO fin_comisionista_rates (comisionista_id, tipo_operacion, pct)
       VALUES (?,?,?) ON DUPLICATE KEY UPDATE pct=VALUES(pct), updated_at=NOW(3)`,
      [comisionistaId, r.tipo_operacion.toUpperCase(), r.pct]
    );
  }
}

async function deleteComisionistaRate(pool, comisionistaId, tipoOperacion) {
  await pool.query(
    `DELETE FROM fin_comisionista_rates WHERE comisionista_id=? AND tipo_operacion=?`,
    [comisionistaId, tipoOperacion.toUpperCase()]
  );
}

// ── Empresas ──────────────────────────────────────────────────────────────────

async function getEmpresas(pool) {
  const [rows] = await pool.query(`
    SELECT e.*, COUNT(c.id) AS total_cuentas
    FROM fin_empresas e
    LEFT JOIN fin_empresa_cuentas c ON c.empresa_id = e.id AND c.is_active = 1
    GROUP BY e.id ORDER BY e.origen, e.nombre`);
  return rows;
}

async function createEmpresa(pool, { nombre, rfc, origen, representante_nombre, notas }) {
  const [res] = await pool.query(
    `INSERT INTO fin_empresas (nombre, rfc, origen, representante_nombre, notas) VALUES (?,?,?,?,?)`,
    [nombre, rfc ?? null, origen ?? 'nuestra', representante_nombre ?? null, notas ?? null]
  );
  return res.insertId;
}

async function updateEmpresa(pool, id, fields) {
  const map = { nombre: 'nombre', rfc: 'rfc', origen: 'origen', representante_nombre: 'representante_nombre', notas: 'notas', is_active: 'is_active' };
  const sets = []; const params = [];
  for (const [k, col] of Object.entries(map)) {
    if (fields[k] !== undefined) { sets.push(`${col}=?`); params.push(k === 'is_active' ? (fields[k] ? 1 : 0) : fields[k]); }
  }
  if (!sets.length) return;
  params.push(id);
  await pool.query(`UPDATE fin_empresas SET ${sets.join(',')},updated_at=NOW(3) WHERE id=?`, params);
}

async function getEmpresaCuentas(pool, empresaId) {
  const [rows] = await pool.query(
    `SELECT * FROM fin_empresa_cuentas WHERE empresa_id=? AND is_active=1 ORDER BY created_at DESC`,
    [empresaId]
  );
  return rows;
}

async function createEmpresaCuenta(pool, empresaId, { banco, titular, clabe, num_cuenta, num_tarjeta, moneda, alias }) {
  const [res] = await pool.query(
    `INSERT INTO fin_empresa_cuentas (empresa_id, banco, titular, clabe, num_cuenta, num_tarjeta, moneda, alias)
     VALUES (?,?,?,?,?,?,?,?)`,
    [empresaId, banco, titular, clabe ?? null, num_cuenta ?? null, num_tarjeta ?? null, moneda ?? 'MXN', alias ?? null]
  );
  return res.insertId;
}

async function updateEmpresaCuenta(pool, id, fields) {
  const map = { banco:'banco', titular:'titular', clabe:'clabe', num_cuenta:'num_cuenta', num_tarjeta:'num_tarjeta', moneda:'moneda', alias:'alias', is_active:'is_active' };
  const sets = []; const params = [];
  for (const [k, col] of Object.entries(map)) {
    if (fields[k] !== undefined) { sets.push(`${col}=?`); params.push(k === 'is_active' ? (fields[k] ? 1 : 0) : fields[k]); }
  }
  if (!sets.length) return;
  params.push(id);
  await pool.query(`UPDATE fin_empresa_cuentas SET ${sets.join(',')},updated_at=NOW(3) WHERE id=?`, params);
}

// ── Comisiones ────────────────────────────────────────────────────────────────

async function getComisiones(pool, { pagado, comisionistaId, clientId, limit = 100, offset = 0 } = {}) {
  const where = ['1=1']; const params = [];
  if (pagado !== undefined) { where.push('fc.pagado=?'); params.push(pagado ? 1 : 0); }
  if (comisionistaId)       { where.push('fc.comisionista_id=?'); params.push(comisionistaId); }
  if (clientId)             { where.push('fc.client_id=?'); params.push(clientId); }
  const [rows] = await pool.query(`
    SELECT fc.*, cs.nombre AS comisionista_nombre, cl.nombre AS client_nombre
    FROM fin_comisiones fc
    JOIN fin_comisionistas cs ON cs.id = fc.comisionista_id
    JOIN fin_clients cl ON cl.id = fc.client_id
    WHERE ${where.join(' AND ')}
    ORDER BY fc.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]);
  return rows;
}

async function marcarComisionPagada(pool, id) {
  await pool.query(
    `UPDATE fin_comisiones SET pagado=1, fecha_pago=NOW(3), updated_at=NOW(3) WHERE id=?`, [id]
  );
}

// ── Modelos por cliente ───────────────────────────────────────────────────────

async function getClientModelsFull(pool, clientId) {
  const [rows] = await pool.query(
    `SELECT * FROM fin_client_models WHERE client_id=? ORDER BY tipo_operacion`, [clientId]
  );
  return rows;
}

async function upsertClientModel(pool, clientId, tipoOperacion, { comision_pct, es_credito, is_active, notas }) {
  await pool.query(
    `INSERT INTO fin_client_models (client_id, tipo_operacion, comision_pct, es_credito, is_active, notas)
     VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE comision_pct=VALUES(comision_pct), es_credito=VALUES(es_credito),
       is_active=VALUES(is_active), notas=VALUES(notas), updated_at=NOW(3)`,
    [clientId, tipoOperacion.toUpperCase(), comision_pct, es_credito ? 1 : 0, is_active !== false ? 1 : 0, notas ?? null]
  );
}

async function assignComisionistaToClient(pool, clientId, comisionistaId) {
  await pool.query(
    `UPDATE fin_clients SET comisionista_id=?, updated_at=NOW(3) WHERE id=?`,
    [comisionistaId ?? null, clientId]
  );
}

async function getEmpresaNuestraForClient(pool, clientId) {
  const [rows] = await pool.query(`
    SELECT e.nombre AS empresa_nombre, ec.banco, ec.titular, ec.clabe, ec.num_cuenta, ec.alias
    FROM fin_client_empresas ce
    JOIN fin_empresas e ON e.id = ce.empresa_id AND e.origen = 'nuestra' AND e.is_active = 1
    JOIN fin_empresa_cuentas ec ON ec.empresa_id = e.id AND ec.is_active = 1
    WHERE ce.client_id = ? AND ce.is_active = 1
    ORDER BY ec.id ASC LIMIT 1
  `, [clientId]);
  return rows[0] ?? null;
}

async function saveEmpresaClienteFromChat(pool, clientId, cuentas) {
  for (const c of cuentas) {
    const titular = (c.titular || 'Sin nombre').trim();
    const [existing] = await pool.query(`
      SELECT e.id FROM fin_empresas e
      JOIN fin_client_empresas ce ON ce.empresa_id = e.id AND ce.client_id = ?
      WHERE e.nombre = ? AND e.origen = 'cliente' AND e.is_active = 1 LIMIT 1
    `, [clientId, titular]);

    let empresaId;
    if (existing.length > 0) {
      empresaId = existing[0].id;
    } else {
      const [res] = await pool.query(
        `INSERT INTO fin_empresas (nombre, origen) VALUES (?, 'cliente')`, [titular]
      );
      empresaId = res.insertId;
      await pool.query(
        `INSERT INTO fin_client_empresas (client_id, empresa_id) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE is_active=1, updated_at=NOW(3)`,
        [clientId, empresaId]
      );
    }

    const numero = c.numero ?? c.clabe ?? c.num_cuenta ?? c.num_tarjeta;
    if (!numero) continue;
    const clabe    = c.tipo === 'CLABE'   ? numero : null;
    const tarjeta  = c.tipo === 'tarjeta' ? numero : null;
    const numCuenta = (!clabe && !tarjeta) ? numero : null;
    const checkCol = clabe ? 'clabe' : tarjeta ? 'num_tarjeta' : 'num_cuenta';
    const checkVal = clabe ?? tarjeta ?? numCuenta;

    const [dup] = await pool.query(
      `SELECT id FROM fin_empresa_cuentas WHERE empresa_id=? AND ${checkCol}=? LIMIT 1`,
      [empresaId, checkVal]
    );
    if (!dup.length) {
      await pool.query(
        `INSERT INTO fin_empresa_cuentas (empresa_id, banco, titular, clabe, num_tarjeta, num_cuenta)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [empresaId, c.banco || 'Sin banco', titular, clabe, tarjeta, numCuenta]
      );
    }
  }
}

async function getClientesAsignadosEmpresa(pool, empresaId) {
  const [rows] = await pool.query(`
    SELECT c.id, c.nombre, c.telegram_username, c.saldo, ce.is_active
    FROM fin_client_empresas ce
    JOIN fin_clients c ON c.id = ce.client_id
    WHERE ce.empresa_id = ? ORDER BY c.nombre
  `, [empresaId]);
  return rows;
}

async function toggleClienteEmpresa(pool, clientId, empresaId, isActive) {
  await pool.query(`
    INSERT INTO fin_client_empresas (client_id, empresa_id, is_active)
    VALUES (?,?,?) ON DUPLICATE KEY UPDATE is_active=VALUES(is_active), updated_at=NOW(3)
  `, [clientId, empresaId, isActive ? 1 : 0]);
}

/** Retorna array de telegram_user_id de clientes marcados como admin */
async function getAdminUserIds(pool) {
  const [rows] = await pool.query(
    `SELECT telegram_user_id FROM fin_clients WHERE is_admin = 1`
  );
  return rows.map(r => parseInt(r.telegram_user_id)).filter(Boolean);
}

/** Activa o desactiva is_admin en fin_clients por telegram_user_id */
async function setClientAdmin(pool, telegramUserId, isAdmin) {
  await pool.query(
    `UPDATE fin_clients SET is_admin = ? WHERE telegram_user_id = ?`,
    [isAdmin ? 1 : 0, String(telegramUserId)]
  );
}

/** Retorna un Set con todos los números de cuenta propios (origen='nuestra') */
async function getNuestrasCLABEs(pool) {
  const [rows] = await pool.query(
    `SELECT ec.clabe, ec.num_cuenta, ec.num_tarjeta
     FROM fin_empresa_cuentas ec
     JOIN fin_empresas e ON e.id = ec.empresa_id
     WHERE e.origen = 'nuestra' AND ec.is_active = 1`
  );
  const set = new Set();
  for (const r of rows) {
    if (r.clabe)       set.add(r.clabe.replace(/\s/g, ''));
    if (r.num_cuenta)  set.add(r.num_cuenta.replace(/\s/g, ''));
    if (r.num_tarjeta) set.add(r.num_tarjeta.replace(/\s/g, ''));
  }
  return set;
}

module.exports = {
  getClientSummary,
  getOperations,
  getDashboardKPIs,
  getVolumeTimeSeries,
  getOpsByType,
  getBalanceHistory,
  getLLMCostsByAgent,
  getBankingAccountsByClient,
  getAllBankingAccounts,
  getLLMCostTimeSeries,
  getOperationTypes,
  updateOperationType,
  getPaymentConfirmations,
  confirmarPagoAdmin,
  getChatList,
  getChatMessages,
  getEmpresaNuestraForClient, saveEmpresaClienteFromChat,
  getClientesAsignadosEmpresa, toggleClienteEmpresa,
  getComisionistas, createComisionista, updateComisionista,
  getComisionistaRates, upsertComisionistaRates, deleteComisionistaRate,
  getEmpresas, createEmpresa, updateEmpresa,
  getEmpresaCuentas, createEmpresaCuenta, updateEmpresaCuenta,
  getComisiones, marcarComisionPagada,
  getClientModelsFull, upsertClientModel, assignComisionistaToClient,
  getNuestrasCLABEs,
  getAdminUserIds, setClientAdmin,
};
