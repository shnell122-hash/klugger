'use strict';
/**
 * Balance Manager Agent — Gestión de saldo por cliente.
 * 100% lógica de DB, sin LLM.
 *
 * Reglas del negocio:
 *   - Operación de ENTRADA (cliente pagó): saldo += monto_neto al confirmar
 *   - Operación de SALIDA (nosotros pagamos): saldo -= monto_bruto al confirmar
 *     → si el cliente tiene saldo suficiente, se descuenta del saldo
 *     → si NO tiene saldo, se envían datos bancarios para que pague
 *   - Al pagar el retorno: para operaciones de entrada, el monto_neto sale del saldo
 */

const { round } = require('./calculator');

class BalanceManager {
  /** @param {import('mysql2/promise').Pool} pool */
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Obtiene o crea un cliente por su telegram_user_id.
   */
  async getOrCreateClient(telegramUserId, username = null) {
    const [rows] = await this.pool.query(
      'SELECT * FROM fin_clients WHERE telegram_user_id = ?',
      [telegramUserId]
    );
    if (rows.length > 0) return rows[0];

    const [result] = await this.pool.query(
      'INSERT INTO fin_clients (telegram_user_id, telegram_username, saldo) VALUES (?,?,0)',
      [telegramUserId, username]
    );
    const [newRows] = await this.pool.query(
      'SELECT * FROM fin_clients WHERE id = ?',
      [result.insertId]
    );
    return newRows[0];
  }

  /**
   * Retorna el saldo actual del cliente.
   */
  async getSaldo(clientId) {
    const [rows] = await this.pool.query(
      'SELECT saldo, saldo_pendiente FROM fin_clients WHERE id = ?',
      [clientId]
    );
    if (!rows.length) throw new Error(`Cliente ${clientId} no encontrado`);
    return {
      saldo: parseFloat(rows[0].saldo),
      saldo_pendiente: parseFloat(rows[0].saldo_pendiente),
    };
  }

  /**
   * Verifica si el cliente tiene saldo suficiente para una operación de salida.
   */
  async tieneSaldoSuficiente(clientId, monto_bruto) {
    const { saldo } = await this.getSaldo(clientId);
    return { tiene: saldo >= monto_bruto, saldo };
  }

  /**
   * Aplica una operación confirmada al saldo del cliente.
   * Registra en fin_balance_history para auditoría completa.
   *
   * @param {object} params
   * @param {number}  params.operationId
   * @param {number}  params.clientId
   * @param {number}  params.monto_neto
   * @param {number}  params.monto_bruto
   * @param {boolean} params.es_entrada
   * @param {import('mysql2/promise').PoolConnection} [conn] - Para usar dentro de transacción
   */
  async aplicarOperacion({ operationId, clientId, monto_neto, monto_bruto, es_entrada }, conn) {
    const db = conn ?? this.pool;

    // Saldo actual
    const [rows] = await db.query(
      'SELECT saldo FROM fin_clients WHERE id = ? FOR UPDATE',
      [clientId]
    );
    const saldo_antes = parseFloat(rows[0].saldo);

    let saldo_despues;
    let tipo_movimiento;

    if (es_entrada) {
      // Cliente pagó → su saldo sube
      saldo_despues = round(saldo_antes + monto_neto);
      tipo_movimiento = 'entrada';
    } else {
      // Nosotros pagamos → descontamos del saldo del cliente
      saldo_despues = round(saldo_antes - monto_bruto);
      tipo_movimiento = 'salida';
    }

    // Actualizar saldo
    await db.query(
      'UPDATE fin_clients SET saldo = ?, updated_at = NOW(3) WHERE id = ?',
      [saldo_despues, clientId]
    );

    // Registrar en historial
    await db.query(
      `INSERT INTO fin_balance_history
         (client_id, operation_id, tipo_movimiento, monto, saldo_antes, saldo_despues, descripcion)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        clientId, operationId, tipo_movimiento,
        es_entrada ? monto_neto : monto_bruto,
        saldo_antes, saldo_despues,
        `Operación #${operationId} - ${tipo_movimiento}`,
      ]
    );

    // Actualizar saldo en la operación (para auditoría)
    await db.query(
      'UPDATE fin_operations SET saldo_antes=?, saldo_despues=? WHERE id=?',
      [saldo_antes, saldo_despues, operationId]
    );

    return { saldo_antes, saldo_despues };
  }

  /**
   * Marca el retorno como pagado y ajusta saldo para operaciones de entrada.
   * Cuando el retorno se paga, el monto_neto sale del saldo del cliente.
   */
  async marcarRetornoPagado({ operationId, clientId, monto_neto }) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const [opRows] = await conn.query(
        'SELECT es_entrada, retorno_pagado FROM fin_operations WHERE id=? FOR UPDATE',
        [operationId]
      );
      if (!opRows.length) throw new Error(`Operación ${operationId} no encontrada`);
      if (opRows[0].retorno_pagado) throw new Error('El retorno ya fue pagado');

      const [clientRows] = await conn.query(
        'SELECT saldo FROM fin_clients WHERE id=? FOR UPDATE',
        [clientId]
      );
      const saldo_antes = parseFloat(clientRows[0].saldo);
      const saldo_despues = round(saldo_antes - monto_neto);

      await conn.query(
        'UPDATE fin_clients SET saldo=?, updated_at=NOW(3) WHERE id=?',
        [saldo_despues, clientId]
      );
      await conn.query(
        'UPDATE fin_operations SET retorno_pagado=1, estado="completada", updated_at=NOW(3) WHERE id=?',
        [operationId]
      );
      await conn.query(
        `INSERT INTO fin_balance_history
           (client_id, operation_id, tipo_movimiento, monto, saldo_antes, saldo_despues, descripcion)
         VALUES (?,?,?,?,?,?,?)`,
        [clientId, operationId, 'retorno_pagado', monto_neto, saldo_antes, saldo_despues,
         `Retorno pagado - Op #${operationId}`]
      );

      await conn.commit();
      return { saldo_antes, saldo_despues };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Ajuste manual de saldo (admin).
   */
  async ajusteManual({ clientId, monto, descripcion, adminId }) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query(
        'SELECT saldo FROM fin_clients WHERE id=? FOR UPDATE',
        [clientId]
      );
      const saldo_antes = parseFloat(rows[0].saldo);
      const saldo_despues = round(saldo_antes + monto);

      await conn.query(
        'UPDATE fin_clients SET saldo=?, updated_at=NOW(3) WHERE id=?',
        [saldo_despues, clientId]
      );
      await conn.query(
        `INSERT INTO fin_balance_history
           (client_id, tipo_movimiento, monto, saldo_antes, saldo_despues, descripcion)
         VALUES (?,?,?,?,?,?)`,
        [clientId, 'ajuste_manual', monto, saldo_antes, saldo_despues,
         descripcion ?? `Ajuste manual por admin ${adminId}`]
      );

      await conn.commit();
      return { saldo_antes, saldo_despues };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Historial de movimientos del cliente (paginado).
   */
  async getHistorial(clientId, limit = 20, offset = 0) {
    const [rows] = await this.pool.query(
      `SELECT bh.*, o.tipo_operacion, o.monto_bruto
       FROM fin_balance_history bh
       LEFT JOIN fin_operations o ON o.id = bh.operation_id
       WHERE bh.client_id = ?
       ORDER BY bh.created_at DESC
       LIMIT ? OFFSET ?`,
      [clientId, limit, offset]
    );
    return rows;
  }
}

module.exports = BalanceManager;
