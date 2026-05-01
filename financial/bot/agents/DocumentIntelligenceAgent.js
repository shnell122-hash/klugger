'use strict';
const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODEL = 'gemini-1.5-flash';

const SYSTEM_INSTRUCTION =
  'Eres un agente de inteligencia financiera especializado en México. ' +
  'Analiza documentos financieros con precisión y responde SIEMPRE en JSON válido. ' +
  'Tipos de documento: factura (CFDI, UUID, RFC, IVA), comprobante (SPEI, referencia, clave de rastreo), lista_cuentas. ' +
  'Tipos de operación en México: IAS, SPEI, SINDICATO, TARJETAS, EFECTIVO.';

class DocumentIntelligenceAgent {
  constructor(apiKey) {
    if (!apiKey) throw new Error('DocumentIntelligenceAgent requiere GOOGLE_API_KEY');
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    });
  }

  // Drop-in replacement for InvoiceAgent.procesarBuffer
  async procesarBuffer(buffer, mimeType = '', fileName = '') {
    const mime = mimeType.toLowerCase();
    const ext  = (fileName.split('.').pop() ?? '').toLowerCase();

    if (mime.startsWith('image/')) {
      return this._analizarImagen(buffer, mimeType);
    }

    let texto = '';
    try {
      if (mime.includes('spreadsheet') || mime.includes('excel') || ext === 'xlsx' || ext === 'xls') {
        const XLSX = require('xlsx');
        const wb   = XLSX.read(buffer, { type: 'buffer' });
        texto = wb.SheetNames.map(s => XLSX.utils.sheet_to_csv(wb.Sheets[s])).join('\n');
      } else if (mime.includes('pdf') || ext === 'pdf') {
        try {
          const pdfParse = require('pdf-parse');
          texto = (await pdfParse(buffer)).text ?? '';
        } catch {
          texto = buffer.toString('latin1').replace(/[^\x20-\x7E\n]/g, ' ');
        }
      } else {
        texto = buffer.toString('utf-8');
      }
    } catch (err) {
      console.error('[DocumentIntelligenceAgent] Error extrayendo texto:', err.message);
      return null;
    }

    if (!texto.trim()) return null;
    return this._analizarTexto(texto, fileName);
  }

  async _analizarTexto(texto, fileName = '') {
    const prompt =
      `Analiza este documento financiero.\nArchivo: ${fileName || 'desconocido'}\n\n` +
      `Texto:\n${texto.slice(0, 3000)}\n\n` +
      `Responde con este JSON:\n` +
      `{"tipo":"factura|comprobante|otro","monto_total":0,"tipo_operacion":"IAS|SPEI|SINDICATO|TARJETAS|EFECTIVO|null",` +
      `"confianza":"alta|media|baja","datos_bancarios":[],"emisor":null,"emisor_rfc":null}`;

    try {
      const start  = Date.now();
      const result = await this.model.generateContent(prompt);
      const parsed = JSON.parse(result.response.text());
      console.log(`[DocumentIntelligenceAgent/gemini] texto ${Date.now() - start}ms`);
      if (parsed.tipo === 'otro' || !parsed.monto_total) return null;
      return parsed;
    } catch (e) {
      console.error('[DocumentIntelligenceAgent] _analizarTexto:', e.message);
      return null;
    }
  }

  async _analizarImagen(imageBuffer, mimeType) {
    const base64    = imageBuffer.toString('base64');
    const mediaType = mimeType.startsWith('image/') ? mimeType : 'image/jpeg';

    const prompt =
      'Analiza esta imagen. Puede ser: factura SAT, comprobante de transferencia, captura de app bancaria, ' +
      'recibo de pago, lista/tabla de cuentas bancarias para pago masivo, etc.\n\n' +
      'Responde con este JSON exacto:\n' +
      '{"tipo":"factura|comprobante|lista_cuentas|desconocido",' +
      '"monto_total":null,' +
      '"tipo_operacion":"IAS|SPEI|SINDICATO|TARJETAS|EFECTIVO|null",' +
      '"confianza":"alta|media|baja",' +
      '"emisor":null,"emisor_rfc":null,' +
      '"datos_bancarios":[{"tipo":"CLABE|tarjeta|cuenta","numero":"solo dígitos","banco":null,"titular":null}],' +
      '"cuentas_lista":[{"nombre":null,"numero":"solo dígitos","banco":null,"monto":null,"confianza":"alta|media|baja"}]}\n' +
      '- monto_total: solo para facturas/comprobantes (número); null para listas de cuentas\n' +
      '- cuentas_lista: solo cuando es lista/tabla de cuentas para pago masivo\n' +
      '- datos_bancarios: cuentas origen/destino en facturas o comprobantes';

    try {
      const start  = Date.now();
      const result = await this.model.generateContent([
        { inlineData: { mimeType: mediaType, data: base64 } },
        { text: prompt },
      ]);
      const parsed = JSON.parse(result.response.text());
      console.log(`[DocumentIntelligenceAgent/gemini] imagen ${Date.now() - start}ms`);
      return parsed;
    } catch (e) {
      console.error('[DocumentIntelligenceAgent] _analizarImagen:', e.message);
      return null;
    }
  }

  // Single Gemini call that returns both cuentas and factura data — avoids double API call
  async analizarImagenCompleta(imageBuffer, mimeType) {
    const result = await this._analizarImagen(imageBuffer, mimeType);
    if (!result) return { cuentas: [], visionResult: null };

    const raw = result.cuentas_lista?.length ? result.cuentas_lista : (result.datos_bancarios ?? []);
    const cuentas = raw
      .map(c => {
        const num = String(c.numero ?? '').replace(/[\s\-.]/g, '');
        if (!/^\d{10,19}$/.test(num)) return null;
        let tipo = 'cuenta';
        if      (/^\d{18}$/.test(num)) tipo = 'CLABE';
        else if (/^\d{16}$/.test(num)) tipo = 'tarjeta';
        return { tipo, numero: num, titular: c.nombre ?? c.titular ?? null,
                 banco: c.banco ?? null, monto: c.monto != null ? parseFloat(c.monto) : null,
                 confianza: c.confianza ?? 'media' };
      })
      .filter(Boolean);

    const visionResult = (result.monto_total || result.tipo === 'factura') ? {
      tipo:            result.tipo ?? 'desconocido',
      monto_total:     result.monto_total,
      emisor_nombre:   result.emisor,
      emisor_rfc:      result.emisor_rfc,
      receptor_nombre: null,
      concepto:        null,
      fecha:           null,
      folio:           null,
      datos_bancarios: (result.datos_bancarios ?? [])
        .map(d => { const num = String(d.numero ?? '').replace(/[\s\-.]/g, '');
                    return /^\d{10,19}$/.test(num) ? { ...d, numero: num } : null; })
        .filter(Boolean),
    } : null;

    return { cuentas, visionResult };
  }

  // Drop-in replacement for VisionAgent.extraerCuentasBancarias
  async extraerCuentasBancarias(imageBuffer, mimeType) {
    const result = await this._analizarImagen(imageBuffer, mimeType);
    if (!result) return { cuentas: [], notas: null };

    const raw = result.cuentas_lista?.length ? result.cuentas_lista : (result.datos_bancarios ?? []);
    const cuentas = raw
      .map(c => {
        const num = String(c.numero ?? '').replace(/[\s\-.]/g, '');
        if (!/^\d{10,19}$/.test(num)) return null;
        let tipo = 'cuenta';
        if      (/^\d{18}$/.test(num)) tipo = 'CLABE';
        else if (/^\d{16}$/.test(num)) tipo = 'tarjeta';
        return {
          tipo,
          numero:    num,
          titular:   c.nombre ?? c.titular ?? null,
          banco:     c.banco  ?? null,
          monto:     c.monto  != null ? parseFloat(c.monto) : null,
          confianza: c.confianza ?? 'media',
        };
      })
      .filter(Boolean);

    return { cuentas, notas: result.notas ?? null };
  }

  // Drop-in replacement for VisionAgent.analizarFactura
  async analizarFactura(imageBuffer, mimeType) {
    const result = await this._analizarImagen(imageBuffer, mimeType);
    if (!result || (!result.monto_total && result.tipo !== 'factura')) return null;
    return {
      tipo:            result.tipo ?? 'desconocido',
      monto_total:     result.monto_total,
      emisor_nombre:   result.emisor,
      emisor_rfc:      result.emisor_rfc,
      receptor_nombre: null,
      concepto:        null,
      fecha:           null,
      folio:           null,
      datos_bancarios: (result.datos_bancarios ?? [])
        .map(d => {
          const num = String(d.numero ?? '').replace(/[\s\-.]/g, '');
          return /^\d{10,19}$/.test(num) ? { ...d, numero: num } : null;
        })
        .filter(Boolean),
    };
  }

  // Analiza un cuadro de retorno semanal IAS (tablas NETO/%/BRUTO/CLABE, fondo oscuro iOS)
  async analizarCuadroRetorno(imageBuffer, mimeType) {
    const base64    = imageBuffer.toString('base64');
    const mediaType = mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
    const prompt =
      'Esta imagen es un cuadro de retornos semanal para dispersión IAS en México.\n' +
      'Contiene una tabla con columnas: CLAVE, NOMBRE, NETO, % (o COMISION), BRUTO, y a veces BANCO/CLABE.\n' +
      'Puede tener fondo oscuro (modo oscuro de iOS/WhatsApp).\n\n' +
      'Extrae CADA FILA y responde con este JSON exacto:\n' +
      '{"tipo":"cuadro_retorno","filas":[{"clave":1,"nombre":"GERMAN VILAR ARGUETA","neto":23000,"pct":0.055,"bruto":24338.62,"banco":"Banregio","clabe":"058597000030773833"}],' +
      '"total_neto":0,"total_bruto":0}\n\n' +
      'Reglas:\n' +
      '- pct: dividir entre 100 si viene como "5.50%" → 0.055\n' +
      '- Si no hay CLABE en la tabla, dejar clabe: null\n' +
      '- Si el BRUTO no aparece, calcularlo: bruto = neto / (1 - pct)\n' +
      '- total_neto y total_bruto: suma de todas las filas\n' +
      '- Si la imagen no es un cuadro de retorno, responder {"tipo":"otro"}';

    try {
      const start = Date.now();
      // Use a model without JSON-only constraint to allow audio/image prompts
      const flexModel = this.genAI.getGenerativeModel({ model: MODEL, temperature: 0 });
      const result = await flexModel.generateContent([
        { inlineData: { mimeType: mediaType, data: base64 } },
        { text: prompt },
      ]);
      const text   = result.response.text().replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(text);
      console.log(`[DocumentIntelligenceAgent/gemini] cuadroRetorno ${Date.now() - start}ms`);
      return parsed;
    } catch (e) {
      console.error('[DocumentIntelligenceAgent] analizarCuadroRetorno:', e.message);
      return null;
    }
  }

  // Transcribe un mensaje de audio (OGG/MP3/M4A) via Gemini 1.5 Flash nativo
  async transcribirAudio(audioBuffer, mimeType = 'audio/ogg') {
    const base64 = audioBuffer.toString('base64');
    const prompt =
      'Transcribe este mensaje de audio en español. Es una conversación de negocios financieros México.\n' +
      'Devuelve SOLO el texto transcrito, sin explicaciones ni formato adicional.';
    try {
      const start      = Date.now();
      const flexModel  = this.genAI.getGenerativeModel({ model: MODEL, temperature: 0 });
      const result     = await flexModel.generateContent([
        { inlineData: { data: base64, mimeType } },
        { text: prompt },
      ]);
      const transcripcion = result.response.text().trim();
      console.log(`[DocumentIntelligenceAgent/gemini] audio ${Date.now() - start}ms — ${transcripcion.length} chars`);
      return transcripcion || null;
    } catch (e) {
      console.error('[DocumentIntelligenceAgent] transcribirAudio:', e.message);
      return null;
    }
  }
}

module.exports = DocumentIntelligenceAgent;
