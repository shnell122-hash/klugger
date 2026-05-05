'use strict';
/**
 * Rutas financieras para Express — se montan en backend/server.js.
 *
 * Uso en server.js:
 *   const financialRoutes = require('../financial/backend/routes/financial');
 *   app.use('/api/financial', financialRoutes(pool, io));
 */

const q    = require('../../db/financial-queries');
const path = require('path');

// Lee FIN_TELEGRAM_BOT_TOKEN de financial/.env si no está en el proceso actual
function getTelegramToken() {
  if (process.env.FIN_TELEGRAM_BOT_TOKEN) return process.env.FIN_TELEGRAM_BOT_TOKEN;
  try {
    const env = require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }).parsed;
    return env?.FIN_TELEGRAM_BOT_TOKEN ?? null;
  } catch { return null; }
}

module.exports = function financialRoutes(pool, io, express) {
  const router = express.Router();

  // ── KPIs ─────────────────────────────────────────────────────────────────

  router.get('/kpis', async (req, res) => {
    try {
      const data = await q.getDashboardKPIs(pool);
      res.json({ ok: true, data });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Clientes ──────────────────────────────────────────────────────────────

  router.get('/clients', async (req, res) => {
    try {
      const data = await q.getClientSummary(pool, parseInt(req.query.limit) || 50);
      res.json({ ok: true, data });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get('/clients/:id/balance-history', async (req, res) => {
    try {
      const data = await q.getBalanceHistory(
        pool, req.params.id, parseInt(req.query.limit) || 50
      );
      res.json({ ok: true, data });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Operaciones ───────────────────────────────────────────────────────────

  router.get('/operations', async (req, res) => {
    try {
      const data = await q.getOperations(pool, {
        clientId:   req.query.client_id,
        estado:     req.query.estado,
        fechaDesde: req.query.desde,
        fechaHasta: req.query.hasta,
        limit:      parseInt(req.query.limit)  || 100,
        offset:     parseInt(req.query.offset) || 0,
      });
      res.json({ ok: true, data });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Marcar retorno como pagado (admin)
  router.post('/operations/:id/retorno-pagado', async (req, res) => {
    try {
      const [rows] = await pool.query(
        'SELECT client_id, monto_neto, es_entrada FROM fin_operations WHERE id=?',
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ ok: false, error: 'No encontrada' });

      const { client_id, monto_neto, es_entrada } = rows[0];
      if (!es_entrada) {
        return res.status(400).json({ ok: false, error: 'Solo aplica para operaciones de entrada' });
      }

      // Importar BalanceManager
      const BalanceManager = require('../../bot/agents/balance-manager');
      const bm = new BalanceManager(pool);
      const result = await bm.marcarRetornoPagado({
        operationId: parseInt(req.params.id),
        clientId:    client_id,
        monto_neto:  parseFloat(monto_neto),
      });

      // Emitir evento Socket.io para actualizar dashboard en vivo
      io?.emit('financial:operation_updated', { id: req.params.id, ...result });

      res.json({ ok: true, data: result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Analytics ─────────────────────────────────────────────────────────────

  router.get('/analytics/volume', async (req, res) => {
    try {
      const data = await q.getVolumeTimeSeries(pool, parseInt(req.query.days) || 30);
      res.json({ ok: true, data });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get('/analytics/by-type', async (req, res) => {
    try {
      const data = await q.getOpsByType(pool, parseInt(req.query.days) || 30);
      res.json({ ok: true, data });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get('/analytics/llm-costs', async (req, res) => {
    try {
      const [byAgent, timeSeries] = await Promise.all([
        q.getLLMCostsByAgent(pool, parseInt(req.query.days) || 30),
        q.getLLMCostTimeSeries(pool, parseInt(req.query.days) || 30),
      ]);
      res.json({ ok: true, data: { byAgent, timeSeries } });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Config de operaciones (admin) ─────────────────────────────────────────

  router.get('/config/operation-types', async (req, res) => {
    try {
      const data = await q.getOperationTypes(pool);
      res.json({ ok: true, data });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.patch('/config/operation-types/:codigo', async (req, res) => {
    try {
      const { comision_pct, instrucciones_pago } = req.body;
      if (comision_pct !== undefined) {
        if (typeof comision_pct !== 'number' || comision_pct < 0 || comision_pct >= 1) {
          return res.status(400).json({ ok: false, error: 'comision_pct debe ser decimal entre 0 y 1' });
        }
      }
      await q.updateOperationType(pool, req.params.codigo, { comision_pct, instrucciones_pago });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // PATCH /clients/:id — actualizar nombre del cliente
  router.patch('/clients/:id', async (req, res) => {
    try {
      const { nombre } = req.body;
      if (!nombre?.trim()) return res.status(400).json({ ok: false, error: 'nombre requerido' });
      await q.updateClientNombre(pool, parseInt(req.params.id), nombre);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Cuentas bancarias ─────────────────────────────────────────────────────

  // GET /empresa-cuentas-all — todas las cuentas de empresa con info
  router.get('/empresa-cuentas-all', async (req, res) => {
    try {
      const data = await q.getAllEmpresaCuentasWithInfo(pool);
      res.json({ ok: true, data });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get('/banking-accounts', async (req, res) => {
    try {
      const limit  = parseInt(req.query.limit  ?? 200);
      const offset = parseInt(req.query.offset ?? 0);
      const data   = await q.getAllBankingAccounts(pool, limit, offset);
      res.json({ ok: true, data });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get('/clients/:id/banking-accounts', async (req, res) => {
    try {
      const data = await q.getBankingAccountsByClient(pool, parseInt(req.params.id));
      res.json({ ok: true, data });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Chats y mensajes ─────────────────────────────────────────────────────

  router.get('/chats', async (req, res) => {
    try {
      const data = await q.getChatList(pool, parseInt(req.query.limit ?? 200));
      res.json({ ok: true, data });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get('/chats/:chatId/messages', async (req, res) => {
    try {
      const data = await q.getChatMessages(
        pool, req.params.chatId,
        parseInt(req.query.limit ?? 50), parseInt(req.query.offset ?? 0)
      );
      res.json({ ok: true, data });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.patch('/chats/:chatId', async (req, res) => {
    try {
      const { concepto, titulo } = req.body;
      const sets = []; const params = [];
      if (concepto !== undefined) { sets.push('concepto=?'); params.push(concepto); }
      if (titulo   !== undefined) { sets.push('titulo=?');   params.push(titulo); }
      if (!sets.length) return res.status(400).json({ ok: false, error: 'Nada que actualizar' });
      sets.push('updated_at=NOW(3)');
      params.push(req.params.chatId);
      await pool.query(`UPDATE fin_chats SET ${sets.join(',')} WHERE chat_id=?`, params);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Confirmaciones de pago ────────────────────────────────────────────────

  router.get('/payment-confirmations', async (req, res) => {
    try {
      const data = await q.getPaymentConfirmations(pool, {
        clientId: req.query.client_id ? parseInt(req.query.client_id) : undefined,
        estado:   req.query.estado,
        limit:    parseInt(req.query.limit  ?? 100),
        offset:   parseInt(req.query.offset ?? 0),
      });
      res.json({ ok: true, data });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Confirmar pago desde el dashboard (admin)
  router.post('/clients/:id/confirmar-pago', async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      const { monto, tipo_operacion, notas } = req.body;
      if (!monto || monto <= 0) return res.status(400).json({ ok: false, error: 'monto requerido' });

      const result = await q.confirmarPagoAdmin(pool, clientId, { monto: parseFloat(monto), tipo_operacion, notas });
      io?.emit('financial:payment_confirmed', { clientId, ...result });
      res.json({ ok: true, data: result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // POST /clients/:id/ajuste — ajuste manual de saldo (positivo o negativo)
  router.post('/clients/:id/ajuste', async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      const { monto, descripcion } = req.body;
      if (monto === undefined || monto === null || isNaN(parseFloat(monto))) {
        return res.status(400).json({ ok: false, error: 'monto requerido (puede ser negativo)' });
      }
      const BalanceManager = require('../../bot/agents/balance-manager');
      const bm = new BalanceManager(pool);
      const result = await bm.ajusteManual({
        clientId,
        monto:       parseFloat(monto),
        descripcion: descripcion || 'Ajuste manual (dashboard)',
        adminId:     0,
      });
      io?.emit('financial:saldo_ajustado', { clientId, ...result });
      res.json({ ok: true, data: result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // GET /payment-confirmations/:id/image — proxy imagen Telegram
  router.get('/payment-confirmations/:id/image', async (req, res) => {
    try {
      const [[row]] = await pool.query(
        'SELECT telegram_file_id FROM fin_payment_confirmations WHERE id=?',
        [req.params.id]
      );
      const fileId = row?.telegram_file_id;
      if (!fileId) return res.status(404).json({ ok: false, error: 'Sin imagen adjunta' });

      const token = getTelegramToken();
      if (!token) return res.status(503).json({ ok: false, error: 'FIN_TELEGRAM_BOT_TOKEN no configurado' });

      const fr = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
      const fd = await fr.json();
      if (!fd.ok) return res.status(404).json({ ok: false, error: 'Archivo no encontrado en Telegram' });

      const imgRes = await fetch(`https://api.telegram.org/file/bot${token}/${fd.result.file_path}`);
      res.set('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=86400');
      imgRes.body.pipe(res);
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Comisionistas ─────────────────────────────────────────────────────────

  router.get('/comisionistas', async (req, res) => {
    try { res.json({ ok: true, data: await q.getComisionistas(pool) }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  router.post('/comisionistas', async (req, res) => {
    try {
      const { nombre } = req.body;
      if (!nombre) return res.status(400).json({ ok: false, error: 'nombre requerido' });
      const id = await q.createComisionista(pool, req.body);
      res.json({ ok: true, data: { id } });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  router.patch('/comisionistas/:id', async (req, res) => {
    try {
      await q.updateComisionista(pool, req.params.id, req.body);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  router.get('/comisionistas/:id/rates', async (req, res) => {
    try { res.json({ ok: true, data: await q.getComisionistaRates(pool, req.params.id) }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  router.put('/comisionistas/:id/rates', async (req, res) => {
    try {
      const { rates } = req.body;
      if (!Array.isArray(rates)) return res.status(400).json({ ok: false, error: 'rates[] requerido' });
      await q.upsertComisionistaRates(pool, req.params.id, rates);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  router.delete('/comisionistas/:id/rates/:tipo', async (req, res) => {
    try {
      await q.deleteComisionistaRate(pool, req.params.id, req.params.tipo);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  // ── Empresas ──────────────────────────────────────────────────────────────

  router.get('/empresas', async (req, res) => {
    try { res.json({ ok: true, data: await q.getEmpresas(pool) }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  router.post('/empresas', async (req, res) => {
    try {
      const { nombre } = req.body;
      if (!nombre) return res.status(400).json({ ok: false, error: 'nombre requerido' });
      const id = await q.createEmpresa(pool, req.body);
      res.json({ ok: true, data: { id } });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  router.patch('/empresas/:id', async (req, res) => {
    try {
      await q.updateEmpresa(pool, req.params.id, req.body);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  router.delete('/empresas/:id', async (req, res) => {
    try {
      await pool.query('DELETE FROM fin_empresa_cuentas WHERE empresa_id=?', [req.params.id]);
      await pool.query('DELETE FROM fin_empresas WHERE id=?', [req.params.id]);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  router.get('/empresas/:id/cuentas', async (req, res) => {
    try { res.json({ ok: true, data: await q.getEmpresaCuentas(pool, req.params.id) }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  router.post('/empresas/:id/cuentas', async (req, res) => {
    try {
      const { banco, titular } = req.body;
      if (!banco || !titular) return res.status(400).json({ ok: false, error: 'banco y titular requeridos' });
      const id = await q.createEmpresaCuenta(pool, req.params.id, req.body);
      res.json({ ok: true, data: { id } });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  router.get('/empresas/:id/clientes', async (req, res) => {
    try { res.json({ ok: true, data: await q.getClientesAsignadosEmpresa(pool, req.params.id) }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  router.put('/empresas/:empresaId/clientes/:clientId', async (req, res) => {
    try {
      await q.toggleClienteEmpresa(pool, req.params.clientId, req.params.empresaId, req.body.is_active !== false);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  router.patch('/empresa-cuentas/:id', async (req, res) => {
    try {
      await q.updateEmpresaCuenta(pool, req.params.id, req.body);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  // ── Comisiones ────────────────────────────────────────────────────────────

  router.get('/comisiones', async (req, res) => {
    try {
      const pagado = req.query.pagado !== undefined ? req.query.pagado === '1' : undefined;
      const data = await q.getComisiones(pool, {
        pagado,
        comisionistaId: req.query.comisionista_id ? parseInt(req.query.comisionista_id) : undefined,
        clientId:       req.query.client_id       ? parseInt(req.query.client_id)       : undefined,
        limit:          parseInt(req.query.limit  ?? 200),
        offset:         parseInt(req.query.offset ?? 0),
      });
      res.json({ ok: true, data });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  router.post('/comisiones/:id/pagar', async (req, res) => {
    try {
      await q.marcarComisionPagada(pool, req.params.id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  // ── Modelos por cliente ───────────────────────────────────────────────────

  router.get('/clients/:id/models', async (req, res) => {
    try { res.json({ ok: true, data: await q.getClientModelsFull(pool, req.params.id) }); }
    catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  router.put('/clients/:id/models/:tipo', async (req, res) => {
    try {
      await q.upsertClientModel(pool, req.params.id, req.params.tipo, req.body);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  router.patch('/clients/:id/comisionista', async (req, res) => {
    try {
      await q.assignComisionistaToClient(pool, req.params.id, req.body.comisionista_id ?? null);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  return router;
};
