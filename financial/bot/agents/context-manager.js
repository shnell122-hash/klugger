'use strict';
/**
 * Context Manager — Registra chats y mensajes para contexto de IA y CRM.
 * Crea/actualiza fin_chats y fin_messages en cada interacción.
 */

class ContextManager {
  constructor(pool) {
    this.pool = pool;
  }

  async upsertChat({ chatId, clientId = null, titulo = null, isGroup = false }) {
    await this.pool.query(
      `INSERT INTO fin_chats (chat_id, client_id, titulo, is_group, ultimo_msg_at)
       VALUES (?, ?, ?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE
         client_id     = COALESCE(VALUES(client_id), client_id),
         titulo        = COALESCE(VALUES(titulo), titulo),
         is_group      = VALUES(is_group),
         ultimo_msg_at = NOW(3),
         total_msgs    = total_msgs + 1,
         updated_at    = NOW(3)`,
      [chatId, clientId, titulo, isGroup ? 1 : 0]
    );
  }

  async updateConcepto(chatId, concepto) {
    await this.pool.query(
      'UPDATE fin_chats SET concepto=?, updated_at=NOW(3) WHERE chat_id=?',
      [concepto, chatId]
    );
  }

  async logMessage({ chatId, clientId = null, telegramMsgId = null,
                     fromUserId = null, fromUsername = null,
                     tipo = 'texto', texto = null, fileName = null, esBot = false }) {
    await this.pool.query(
      `INSERT INTO fin_messages
         (chat_id, client_id, telegram_msg_id, from_user_id, from_username,
          tipo, texto, file_name, es_bot)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [chatId, clientId, telegramMsgId, fromUserId, fromUsername,
       tipo, texto ? texto.slice(0, 4000) : null, fileName, esBot ? 1 : 0]
    );
  }

  async getRecientes(chatId, limit = 20) {
    const [rows] = await this.pool.query(
      `SELECT * FROM fin_messages
       WHERE chat_id = ?
       ORDER BY created_at DESC LIMIT ?`,
      [chatId, limit]
    );
    return rows.reverse();
  }

  async getChatList(limit = 100) {
    const [rows] = await this.pool.query(
      `SELECT fc.*, c.nombre AS client_nombre, c.saldo, c.saldo_neto,
              (SELECT texto FROM fin_messages WHERE chat_id=fc.chat_id AND es_bot=0
               ORDER BY created_at DESC LIMIT 1) AS ultimo_texto
       FROM fin_chats fc
       LEFT JOIN fin_clients c ON c.id = fc.client_id
       ORDER BY fc.ultimo_msg_at DESC
       LIMIT ?`,
      [limit]
    );
    return rows;
  }
}

module.exports = ContextManager;
