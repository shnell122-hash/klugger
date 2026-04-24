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

module.exports = {
  getClientSummary,
  getOperations,
  getDashboardKPIs,
  getVolumeTimeSeries,
  getOpsByType,
  getBalanceHistory,
  getLLMCostsByAgent,
  getLLMCostTimeSeries,
  getOperationTypes,
  updateOperationType,
};
