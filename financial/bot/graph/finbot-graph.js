'use strict';
/**
 * FinBotGraph — Grafo principal LangGraph para el bot financiero.
 *
 * Partes implementadas:
 *   1 (skeleton):  estado + checkpointer + clase FinBotGraph
 *   2 (text flow): RouterNode → TextFlowGraph (ParseNode → CommissionNode)
 *
 * Partes pendientes (se añaden nodos aquí conforme avanza la migración):
 *   3: CalculatorNode + VerifierNode + AskFieldsNode
 *   4: BankingQueryNode + ConfirmationNode (INTERRUPT)
 *   5: FileFlowGraph
 *   6: AsistenteModeGraph + VoiceFlowGraph
 *   7: CallbackFlowGraph
 *   8: MySQLCheckpointer completo
 *   9: SupervisorNode
 *  10: cutover financiero-bot-v2.js
 */

const { StateGraph } = require('@langchain/langgraph');
const { FinBotStateAnnotation } = require('./state');
const { MySQLCheckpointer } = require('./mysql-checkpointer');
const routerNode = require('./nodes/router');
const { textFlowGraph } = require('./subgraphs/text-flow-graph');

// ── Función de routing (condicional desde RouterNode) ─────────────────────────
function routeFromRouter(state) {
  const action = state.nextAction;
  if (action === 'text_flow') return 'text_flow';
  // Flujos de Partes 5-7 aún no implementados → END con mensaje de fallback
  return '__end__';
}

// ── Construcción del grafo ────────────────────────────────────────────────────
function buildMainGraph(checkpointer) {
  const graph = new StateGraph(FinBotStateAnnotation)
    .addNode('router', routerNode)
    .addNode('text_flow', textFlowGraph)
    .addEdge('__start__', 'router')
    .addConditionalEdges('router', routeFromRouter, {
      text_flow: 'text_flow',
      __end__: '__end__',
    })
    .addEdge('text_flow', '__end__');

  return graph.compile({ checkpointer });
}

// ── Clase principal ───────────────────────────────────────────────────────────
class FinBotGraph {
  /**
   * @param {object} opts
   * @param {import('mysql2/promise').Pool}  opts.pool
   * @param {import('grammy').Bot}           opts.bot
   * @param {object}                         opts.agents — { balanceManager, bankingManager, ... }
   */
  constructor({ pool, bot, agents = {} }) {
    this.pool   = pool;
    this.bot    = bot;
    this.agents = agents;

    const checkpointer = new MySQLCheckpointer(pool);
    this._app = buildMainGraph(checkpointer);
  }

  /**
   * Construye el estado inicial a partir del contexto de Telegram.
   * Debe llamarse antes de invocar el grafo.
   *
   * @param {import('grammy').Context} ctx
   * @param {object} [extras] — campos adicionales (client, modoChat, etc.)
   * @returns {object} Estado inicial para FinBotStateAnnotation
   */
  static buildState(ctx, extras = {}) {
    const msg  = ctx.message ?? ctx.callbackQuery?.message;
    const from = ctx.from ?? ctx.callbackQuery?.from;

    let messageType = 'unknown';
    if (ctx.callbackQuery)            messageType = 'callback';
    else if (msg?.voice)              messageType = 'voice';
    else if (msg?.photo?.length)      messageType = 'photo';
    else if (msg?.document)           messageType = 'document';
    else if (msg?.text !== undefined) messageType = 'text';

    return {
      chatId:   String(ctx.chat?.id ?? ''),
      userId:   from?.id ?? null,
      username: from?.username ?? null,
      messageType,
      inputText:          msg?.text ?? ctx.callbackQuery?.message?.text ?? null,
      inputCallbackData:  ctx.callbackQuery?.data ?? null,
      inputCallbackMsgId: ctx.callbackQuery?.message?.message_id ?? null,
      ...extras,
    };
  }

  /**
   * Ejecuta el grafo con el contexto de Telegram.
   *
   * @param {import('grammy').Context} ctx
   * @param {object} [extras] — { client, modoChat, sessionId, ... }
   * @returns {Promise<object>} Estado final del grafo
   */
  async invoke(ctx, extras = {}) {
    const state  = FinBotGraph.buildState(ctx, extras);
    const config = { configurable: { thread_id: String(ctx.chat?.id ?? '') } };
    return await this._app.invoke(state, config);
  }
}

module.exports = { FinBotGraph, buildMainGraph };
