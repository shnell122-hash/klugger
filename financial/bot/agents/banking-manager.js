'use strict';
/**
 * Banking Manager — gestiona cuentas bancarias de clientes.
 * Parsea CLABE / tarjeta / cuenta de texto libre, CSV y XLSX.
 */

// Bancos comunes en México
const BANCOS_MX = [
  'BBVA','Bancomer','Banamex','Citibanamex','Santander','Banorte',
  'HSBC','Scotiabank','Inbursa','Azteca','BanBajío','Bajío',
  'Afirme','Multiva','Mifel','CIBanco','Monexe','Ve por más',
  'Spin','Nu','Nubank','Mercado Pago','Hey Banco','Banregio',
];
const BANCO_RE  = new RegExp(`(${BANCOS_MX.join('|')})`, 'gi');
const CLABE_RE  = /\b(\d{18})\b/g;
const TARJETA_RE = /\b(\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4})\b/g;
const CUENTA_RE  = /\b(\d{10,11})\b/g;
const NOMBRE_RE  = /(?:a nombre de|titular[:\s]+|nombre[:\s]+|beneficiario[:\s]+)([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,4})/gi;

class BankingManager {
  constructor(pool) {
    this.pool = pool;
  }

  // ── DB ────────────────────────────────────────────────────────────────────

  async getCuentasRecientes(clientId, limit = 5) {
    const [rows] = await this.pool.query(
      `SELECT * FROM fin_banking_accounts
       WHERE client_id = ? AND is_active = 1
       ORDER BY created_at DESC LIMIT ?`,
      [clientId, limit]
    );
    return rows;
  }

  async getCuentasOperacion(operationId) {
    const [rows] = await this.pool.query(
      `SELECT * FROM fin_banking_accounts WHERE operation_id = ? AND is_active = 1`,
      [operationId]
    );
    return rows;
  }

  async guardarCuentas(clientId, operationId, cuentas) {
    const ids = [];
    for (const c of cuentas) {
      const [r] = await this.pool.query(
        `INSERT INTO fin_banking_accounts
           (client_id, operation_id, tipo, numero, titular, banco, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [clientId, operationId ?? null,
         c.tipo, c.numero, c.titular ?? null, c.banco ?? null, c.notas ?? null]
      );
      ids.push(r.insertId);
    }
    return ids;
  }

  async vincularOperacion(cuentaIds, operationId) {
    if (!cuentaIds?.length || !operationId) return;
    await this.pool.query(
      `UPDATE fin_banking_accounts SET operation_id = ? WHERE id IN (?)`,
      [operationId, cuentaIds]
    );
  }

  async getPaginadas(limit = 100, offset = 0) {
    const [rows] = await this.pool.query(
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

  // ── Parsers (estáticos) ───────────────────────────────────────────────────

  static parsearTexto(texto) {
    if (!texto) return [];
    const t = texto.replace(/\r/g, '');
    const cuentas = [];

    // CLABEs (18 dígitos)
    for (const m of t.matchAll(CLABE_RE)) {
      if (!cuentas.some(c => c.numero === m[1])) {
        cuentas.push({ tipo: 'CLABE', numero: m[1], titular: null, banco: null });
      }
    }

    // Tarjetas (16 dígitos con posibles espacios/guiones)
    for (const m of t.matchAll(TARJETA_RE)) {
      const num = m[1].replace(/[\s\-]/g, '');
      if (num.length === 16 && !cuentas.some(c => c.numero === num || m[0].includes(c.numero))) {
        cuentas.push({ tipo: 'tarjeta', numero: num, titular: null, banco: null });
      }
    }

    // Cuentas 10-11 dígitos (solo si no encontramos CLABE ni tarjeta)
    if (!cuentas.length) {
      for (const m of t.matchAll(CUENTA_RE)) {
        if (!cuentas.some(c => c.numero === m[1])) {
          cuentas.push({ tipo: 'cuenta', numero: m[1], titular: null, banco: null });
        }
      }
    }

    if (!cuentas.length) return [];

    // Enriquecer con banco y titular
    const bancos  = [...t.matchAll(BANCO_RE)].map(m => m[1]);
    const nombres = [...t.matchAll(NOMBRE_RE)].map(m => m[1].trim());

    if (cuentas.length === 1) {
      if (bancos.length)   cuentas[0].banco   = bancos[0];
      if (nombres.length)  cuentas[0].titular = nombres[0];
    } else {
      // Múltiples cuentas: intentar parear por bloques de líneas
      const lineas = t.split('\n');
      cuentas.forEach(cuenta => {
        const lineaIdx = lineas.findIndex(l => l.includes(cuenta.numero.slice(-4)));
        if (lineaIdx === -1) return;
        const bloque = lineas.slice(Math.max(0, lineaIdx - 2), lineaIdx + 3).join(' ');
        const banco  = bloque.match(BANCO_RE)?.[0];
        const nombre = [...bloque.matchAll(NOMBRE_RE)][0]?.[1];
        if (banco)  cuenta.banco   = banco;
        if (nombre) cuenta.titular = nombre.trim();
      });
    }

    return cuentas;
  }

  static parsearCsv(contenido) {
    // CSV/TXT: parsear cada línea como texto
    return BankingManager.parsearTexto(contenido);
  }

  static parsearXlsx(buffer) {
    try {
      const XLSX = require('xlsx');
      const wb   = XLSX.read(buffer, { type: 'buffer' });
      const cuentas = [];

      for (const sheetName of wb.SheetNames) {
        const ws   = wb.Sheets[sheetName];
        // raw:false → números como strings, header:1 → array de arrays
        const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
        if (!filas.length) continue;

        // Detectar fila de encabezados (primera fila no vacía)
        let headerIdx = -1;
        let colNombre = -1, colCuenta = -1, colBanco = -1, colMonto = -1;

        for (let i = 0; i < Math.min(filas.length, 5); i++) {
          const fila = filas[i].map(c => String(c).toUpperCase().trim());
          const iNombre = fila.findIndex(c => /NOMBRE|TITULAR|BENEFICIARIO/.test(c));
          const iCuenta = fila.findIndex(c => /CUENTA|CLABE|NUMERO|NÚMERO/.test(c));
          if (iNombre >= 0 || iCuenta >= 0) {
            headerIdx = i;
            colNombre = iNombre;
            colCuenta = iCuenta;
            colBanco  = fila.findIndex(c => /BANCO|INSTITUCIÓN|INSTITUCION/.test(c));
            colMonto  = fila.findIndex(c => /MONTO|IMPORTE|CANTIDAD/.test(c));
            break;
          }
        }

        if (headerIdx >= 0) {
          // Parseo estructurado fila a fila
          for (let i = headerIdx + 1; i < filas.length; i++) {
            const fila = filas[i];
            const raw  = colCuenta >= 0 ? String(fila[colCuenta] ?? '').replace(/[\s\-]/g, '') : '';
            if (!raw) continue;

            let tipo = 'cuenta';
            let numero = raw;
            if (/^\d{18}$/.test(raw))   { tipo = 'CLABE'; }
            else if (/^\d{16}$/.test(raw)) { tipo = 'tarjeta'; }
            else if (/^\d{10,11}$/.test(raw)) { tipo = 'cuenta'; }
            else { continue; } // no reconocida

            const titular = colNombre >= 0 ? String(fila[colNombre] ?? '').trim() || null : null;
            const banco   = colBanco  >= 0 ? String(fila[colBanco]  ?? '').trim() || null : null;
            const monto   = colMonto  >= 0 ? parseFloat(String(fila[colMonto] ?? '').replace(/[,$\s]/g, '')) || null : null;

            if (!cuentas.some(c => c.numero === numero)) {
              cuentas.push({ tipo, numero, titular, banco, ...(monto ? { monto } : {}) });
            }
          }
        } else {
          // Sin encabezados detectados — escanear celda a celda buscando CLABEs (quitar espacios)
          for (const fila of filas) {
            for (const celda of fila) {
              const raw = String(celda ?? '').replace(/[\s\-]/g, '');
              if (/^\d{18}$/.test(raw) && !cuentas.some(c => c.numero === raw)) {
                cuentas.push({ tipo: 'CLABE', numero: raw, titular: null, banco: null });
              }
            }
          }
        }
      }

      return cuentas;
    } catch (e) {
      return [];
    }
  }

  // ── Formateo ──────────────────────────────────────────────────────────────

  static maskNumero(numero, tipo) {
    if (!numero) return '—';
    if (tipo === 'CLABE') return `${numero.slice(0, 3)}···${numero.slice(-4)}`;
    if (tipo === 'tarjeta') return `●●●● ●●●● ●●●● ${numero.slice(-4)}`;
    return `···${numero.slice(-4)}`;
  }

  static formatearCuentas(cuentas) {
    return cuentas.map((c, i) => {
      const masked  = BankingManager.maskNumero(c.numero, c.tipo);
      const banco   = c.banco   ? `🏦 ${c.banco}`   : '';
      const titular = c.titular ? `👤 ${c.titular}` : '';
      const detalle = [banco, titular].filter(Boolean).join(' · ');
      const monto   = c.monto   ? `\n   💰 $${Number(c.monto).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
      return `${i + 1}. <b>${c.tipo}</b>: <code>${masked}</code>${detalle ? '\n   ' + detalle : ''}${monto}`;
    }).join('\n\n');
  }

  static formatearCuentasConfirmadas(cuentas) {
    return cuentas.map(c => {
      const masked  = BankingManager.maskNumero(c.numero, c.tipo);
      const banco   = c.banco   ? ` · ${c.banco}`   : '';
      const titular = c.titular ? ` · ${c.titular}` : '';
      return `💳 <b>${c.tipo}</b> <code>${masked}</code>${banco}${titular}`;
    }).join('\n');
  }
}

module.exports = BankingManager;
