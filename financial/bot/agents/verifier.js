'use strict';
/**
 * Verifier Agent — Valida operaciones contra reglas de negocio.
 */

const { round } = require('./calculator');

const EPSILON = 0.005;

class Verifier {
  verificarConsistencia(op) {
    const errors   = [];
    const warnings = [];
    const correcciones = {};

    const { monto_bruto, monto_neto, comision_pct } = op;

    if (monto_bruto && monto_neto && comision_pct) {
      const bruto_esperado = round(monto_neto / (1 - comision_pct));
      if (Math.abs(bruto_esperado - monto_bruto) > EPSILON) {
        errors.push(
          `Inconsistencia en cálculo: bruto esperado $${fmt(bruto_esperado)} pero recibido $${fmt(monto_bruto)}`
        );
        correcciones.monto_bruto = bruto_esperado;
      }
    }

    if (monto_neto <= 0) errors.push('El monto neto debe ser mayor a cero');
    if (comision_pct < 0 || comision_pct > 0.5) errors.push(`Comisión fuera de rango: ${(comision_pct * 100).toFixed(2)}%`);
    if (monto_bruto > 1_000_000) warnings.push(`Monto alto: $${fmt(monto_bruto)}. Confirma que es correcto.`);

    if (op.tipo_operacion === 'SPEI' && op.tipo_entrega === 'efectivo') {
      warnings.push('SPEI normalmente se entrega por transferencia, no efectivo. ¿Es correcto?');
    }
    if (op.tipo_operacion === 'EFECTIVO' && op.tipo_entrega === 'spei') {
      warnings.push('Operación EFECTIVO con entrega SPEI es inusual. ¿Es correcto?');
    }
    if (op.es_entrada === false && !op.instrucciones_pago && !op.tiene_saldo_suficiente) {
      warnings.push('No hay instrucciones de pago ni saldo suficiente del cliente');
    }

    return { ok: errors.length === 0, errors, warnings, correcciones };
  }

  verificarSaldo({ saldo_actual, monto_bruto, es_entrada }) {
    if (es_entrada) return { ok: true, mensaje: null };

    if (saldo_actual >= monto_bruto) {
      return { ok: true, tiene_saldo: true, mensaje: `Saldo suficiente ($${fmt(saldo_actual)} ≥ $${fmt(monto_bruto)})` };
    }

    const faltante = round(monto_bruto - saldo_actual);
    return {
      ok: false, tiene_saldo: false, faltante,
      mensaje: `Saldo insuficiente. Saldo: $${fmt(saldo_actual)}, necesita: $${fmt(monto_bruto)}. Faltante: $${fmt(faltante)}`,
    };
  }

  buildVerifyPrompt(op, errors) {
    return `Eres un verificador financiero. Analiza esta operación y sugiere correcciones.
Operación: ${JSON.stringify(op, null, 2)}
Errores detectados: ${errors.join('; ')}
Responde SOLO con JSON: { "correcciones": {...}, "mensaje_usuario": "..." }`;
  }

  formatVerificationResult({ ok, errors, warnings, correcciones }) {
    if (ok && warnings.length === 0) return null;

    const parts = [];
    if (errors.length > 0) {
      parts.push('⚠️ <b>Errores encontrados:</b>');
      errors.forEach(e => parts.push(`  • ${e}`));
    }
    if (warnings.length > 0) {
      parts.push('💡 <b>Advertencias:</b>');
      warnings.forEach(w => parts.push(`  • ${w}`));
    }
    if (Object.keys(correcciones).length > 0) {
      parts.push('🔧 <b>Correcciones sugeridas:</b>');
      Object.entries(correcciones).forEach(([k, v]) => parts.push(`  • ${k}: ${v}`));
    }

    return parts.join('\n');
  }
}

function fmt(n) {
  return Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = Verifier;
