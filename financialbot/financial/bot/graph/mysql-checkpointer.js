'use strict';
/**
 * MySQLCheckpointer — Persiste el estado del grafo LangGraph en fin_sessions.
 *
 * PARTE 1: Stub que extiende MemorySaver y registra los checkpoints en memoria.
 *          La persistencia real a MySQL se implementa en Parte 8.
 *
 * En Parte 8 se sobreescribirán getTuple/put/putWrites para usar fin_sessions.
 */

const { MemorySaver } = require('@langchain/langgraph');

class MySQLCheckpointer extends MemorySaver {
  /**
   * @param {import('mysql2/promise').Pool} pool — MySQL pool (usado en Parte 8)
   */
  constructor(pool) {
    super();
    this.pool = pool;
  }

  // getTuple, put, putWrites heredados de MemorySaver hasta Parte 8.
  // En Parte 8 se sobreescribirán con:
  //   getTuple: SELECT FROM fin_sessions WHERE chat_id=thread_id AND estado != 'completado'
  //   put: UPDATE fin_sessions SET langgraph_checkpoint=? WHERE id=?
  //        o INSERT si no existe
}

module.exports = { MySQLCheckpointer };
