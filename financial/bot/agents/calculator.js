'use strict';
/**
 * Calculator Agent — 100% lógica Python pura (sin LLM).
 * Calcula monto_bruto, monto_neto, comisión y proyección de saldo.
 *
 * FÓRMULAS:
 *   si usuario pide monto_neto:   bruto = neto / (1 - comision_pct)
 *   si usuario pide monto_bruto:  neto  = bruto * (1 - comision_pct)
 *
 * SALDO:
 *   operación de ENTRADA (cliente pagó):  saldo += monto_neto   (cuando se confirma)
 *   operación de SALIDA  (nosotros pagamos): saldo se resta monto_neto cuando se paga el retorno
 */

const DECIMALS = 4;

/**
 * Calcula montos a partir de lo que el cliente solicitó.
 *
 * @param {object} params
 * @param {number}  params.monto       - Monto que el cliente indicó
 * @param {'neto'|'bruto'} params.tipo_monto - ¿El cliente pidió monto neto o bruto?
 * @param {number}  params.comision_pct - Comisión decimal (ej: 0.055)
 * @returns {{ monto_bruto: number, monto_neto: number, comision_pct: number, comision_mxn: number }}
 */
function calcularMontos({ monto, tipo_monto, comision_pct }) {
  if (typeof monto !== 'number' || isNaN(monto) || monto <= 0) {
    throw new Error(`Monto inválido: ${monto}`);
  }
  if (typeof comision_pct !== 'number' || comision_pct < 0 || comision_pct >= 1) {
    throw new Error(`Comisión inválida: ${comision_pct}`);
  }

  let monto_bruto, monto_neto;

  if (tipo_monto === 'neto') {
    // Cliente quiere recibir/pagar exactamente este monto neto
    monto_neto  = round(monto);
    monto_bruto = round(monto / (1 - comision_pct));
  } else {
    // Cliente indicó el monto bruto (total a operar)
    monto_bruto = round(monto);
    monto_neto  = round(monto * (1 - comision_pct));
  }

  const comision_mxn = round(monto_bruto - monto_neto);
  return { monto_bruto, monto_neto, comision_pct, comision_mxn };
}

/**
 * Proyecta el saldo del cliente luego de la operación.
 *
 * @param {object} params
 * @param {number}  params.saldo_actual
 * @param {number}  params.monto_neto
 * @param {boolean} params.es_entrada   - true si el cliente pagó (entrada de dinero)
 * @param {boolean} params.retorno_ya_pagado - true si ya se entregó el retorno
 * @returns {{ saldo_nuevo: number, descripcion: string }}
 */
function proyectarSaldo({ saldo_actual, monto_neto, es_entrada, retorno_ya_pagado = false }) {
  let saldo_nuevo;
  let descripcion;

  if (es_entrada) {
    // El cliente nos pagó → su saldo sube
    saldo_nuevo = round(saldo_actual + monto_neto);
    descripcion = `Saldo anterior $${fmt(saldo_actual)} + $${fmt(monto_neto)} = $${fmt(saldo_nuevo)}`;
  } else {
    // Nosotros le pagamos → primero saldo sube al confirmar, luego baja al pagar retorno
    if (retorno_ya_pagado) {
      saldo_nuevo = round(saldo_actual - monto_neto);
      descripcion = `Saldo anterior $${fmt(saldo_actual)} - $${fmt(monto_neto)} = $${fmt(saldo_nuevo)}`;
    } else {
      // Pendiente de pago de retorno, saldo no cambia aún
      saldo_nuevo = saldo_actual;
      descripcion = `Retorno pendiente de pago ($${fmt(monto_neto)}). Saldo actual: $${fmt(saldo_actual)}`;
    }
  }

  return { saldo_nuevo, descripcion };
}

/**
 * Genera el texto de respuesta para el cliente.
 * Ejemplos exactos del spec del usuario.
 */
function generarRespuestaCalculo({
  tipo_operacion,
  tipo_monto,
  monto,
  monto_bruto,
  monto_neto,
  comision_pct,
  saldo_actual,
  saldo_nuevo,
  tiene_saldo_suficiente,
  datos_bancarios,
  es_entrada,
}) {
  const partes = [];

  // Línea de monto bruto
  if (tipo_monto === 'neto') {
    partes.push(
      `Correcto, el monto bruto a operar es de $${fmt(monto)}/(1-${pctStr(comision_pct)})` +
      `=$${fmt(monto_bruto)}.`
    );
  } else {
    partes.push(
      `Correcto, el monto neto es de $${fmt(monto_bruto)}×(1-${pctStr(comision_pct)})` +
      `=$${fmt(monto_neto)}.`
    );
  }

  // Saldo o datos bancarios
  if (es_entrada) {
    if (saldo_actual !== undefined) {
      partes.push(
        `Su saldo anterior es $${fmt(saldo_actual)} y su saldo nuevo $${fmt(saldo_actual)}` +
        `+$${fmt(monto_neto)}=$${fmt(saldo_nuevo)}.`
      );
    }
  } else {
    // Salida: verificar saldo
    if (tiene_saldo_suficiente && saldo_actual !== undefined) {
      partes.push(
        `Su saldo anterior es $${fmt(saldo_actual)} y su saldo nuevo ` +
        `$${fmt(saldo_actual)}-$${fmt(monto_bruto)}=$${fmt(saldo_nuevo)}.`
      );
    } else if (datos_bancarios) {
      partes.push(`Por favor realice el pago a:\n${datos_bancarios}`);
    }
  }

  return partes.join('\n');
}

// ── helpers ──────────────────────────────────────────────────────────────────

function round(n) {
  return Math.round(n * 10 ** DECIMALS) / 10 ** DECIMALS;
}

function fmt(n) {
  if (n === undefined || n === null) return '—';
  return Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pctStr(pct) {
  return `${(pct * 100).toFixed(1)}%`;
}

module.exports = { calcularMontos, proyectarSaldo, generarRespuestaCalculo, round, fmt, pctStr };
