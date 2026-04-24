'use strict';
/**
 * Rutas financieras para Express — se montan en backend/server.js.
 *
 * Uso en server.js:
 *   const financialRoutes = require('../financial/backend/routes/financial');
 *   app.use('/api/financial', financialRoutes(pool, io));
 */

const express = require('express');
const q       = require('../../db/financial-queries');

module.exports = function financialRoutes(pool, io) {
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

  return router;
};
