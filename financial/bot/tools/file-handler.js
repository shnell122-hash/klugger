'use strict';
/**
 * File Handler Tool — Procesa archivos recibidos por Telegram.
 * Soporta: imágenes, PDF, Excel (.xlsx), Word (.docx), links.
 * Guarda metadata en fin_attachments y archivo en disco.
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

const UPLOAD_DIR = process.env.FIN_UPLOADS_DIR ?? '/tmp/fin-uploads';

// Asegurar directorio
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Tipos de archivo por extensión/mime
const FILE_TYPE_MAP = {
  jpg:  'imagen', jpeg: 'imagen', png: 'imagen', gif: 'imagen', webp: 'imagen',
  pdf:  'pdf',
  xlsx: 'excel', xls: 'excel', csv: 'excel',
  docx: 'word',  doc: 'word',
};

/**
 * Detecta el tipo de archivo a partir del nombre o mime_type.
 */
function detectFileType(fileName, mimeType = '') {
  if (mimeType.startsWith('image/')) return 'imagen';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'excel';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'word';

  const ext = (fileName ?? '').split('.').pop()?.toLowerCase();
  return FILE_TYPE_MAP[ext] ?? 'otro';
}

/**
 * Descarga un archivo de Telegram usando la API directa.
 *
 * @param {string} fileId     - Telegram file_id
 * @param {string} botToken
 * @param {string} destName   - Nombre del archivo destino
 * @returns {Promise<string>} - Ruta local del archivo descargado
 */
async function downloadTelegramFile(fileId, botToken, destName) {
  // 1. Obtener file_path de la API
  const fileMeta = await new Promise((resolve, reject) => {
    https.get(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`,
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(e); }
        });
      }
    ).on('error', reject);
  });

  if (!fileMeta.ok) throw new Error(`Telegram getFile error: ${JSON.stringify(fileMeta)}`);
  const filePath = fileMeta.result.file_path;
  const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

  // 2. Descargar el archivo
  const localPath = path.join(UPLOAD_DIR, destName);
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(localPath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlink(localPath, () => {});
      reject(err);
    });
  });

  return localPath;
}

/**
 * Registra el archivo en la base de datos y lo descarga.
 *
 * @param {object} params
 * @param {import('mysql2/promise').Pool} params.pool
 * @param {number}  params.clientId
 * @param {number|null} params.operationId
 * @param {string}  params.botToken
 * @param {object}  params.telegramFileOrPhoto - document | photo | video
 * @param {string}  [params.mimeType]
 * @param {string}  [params.fileName]
 */
async function handleIncomingFile({ pool, clientId, operationId, botToken, telegramFileOrPhoto, mimeType = '', fileName = '' }) {
  const fileId  = telegramFileOrPhoto.file_id ?? telegramFileOrPhoto.file_unique_id;
  const tipo    = detectFileType(fileName, mimeType);
  const ts      = Date.now();
  const ext     = fileName ? fileName.split('.').pop() : tipo;
  const destName = `${clientId}_${ts}.${ext}`;

  let urlLocal = null;
  let error    = null;

  try {
    urlLocal = await downloadTelegramFile(fileId, botToken, destName);
  } catch (err) {
    error = err.message;
    console.error('[file-handler] Error descargando archivo:', err.message);
  }

  const metadata = {
    mimeType,
    fileName,
    fileSize: telegramFileOrPhoto.file_size ?? null,
    error,
  };

  const [result] = await pool.query(
    `INSERT INTO fin_attachments
       (operation_id, client_id, tipo_archivo, nombre_original, telegram_file_id, url_local, metadata_json)
     VALUES (?,?,?,?,?,?,?)`,
    [operationId, clientId, tipo, fileName || null, fileId, urlLocal, JSON.stringify(metadata)]
  );

  return {
    id: result.insertId,
    tipo,
    urlLocal,
    telegramFileId: fileId,
    error,
  };
}

/**
 * Maneja links recibidos como mensaje de texto.
 */
async function handleIncomingLink({ pool, clientId, operationId, url }) {
  const [result] = await pool.query(
    `INSERT INTO fin_attachments
       (operation_id, client_id, tipo_archivo, nombre_original, url_local, metadata_json)
     VALUES (?,?,?,?,?,?)`,
    [operationId, clientId, 'link', url, url, JSON.stringify({ url })]
  );
  return { id: result.insertId, tipo: 'link', url };
}

/**
 * Detecta si un mensaje de Telegram contiene un archivo que debemos procesar.
 * Retorna el objeto del archivo y su tipo, o null.
 */
function extractFileFromMessage(msg) {
  if (msg.document) {
    return {
      file: msg.document,
      mimeType: msg.document.mime_type ?? '',
      fileName: msg.document.file_name ?? 'archivo',
    };
  }
  if (msg.photo && msg.photo.length > 0) {
    // Tomar la foto de mayor resolución
    const photo = msg.photo[msg.photo.length - 1];
    return { file: photo, mimeType: 'image/jpeg', fileName: `foto_${Date.now()}.jpg` };
  }
  if (msg.video) {
    return { file: msg.video, mimeType: msg.video.mime_type ?? 'video/mp4', fileName: 'video' };
  }
  // Links en texto
  if (msg.text) {
    const urlMatch = msg.text.match(/https?:\/\/[^\s]+/);
    if (urlMatch) return { isLink: true, url: urlMatch[0] };
  }
  if (msg.entities) {
    for (const entity of msg.entities) {
      if (entity.type === 'url' && msg.text) {
        const url = msg.text.slice(entity.offset, entity.offset + entity.length);
        return { isLink: true, url };
      }
    }
  }
  return null;
}

module.exports = { handleIncomingFile, handleIncomingLink, extractFileFromMessage, detectFileType };
