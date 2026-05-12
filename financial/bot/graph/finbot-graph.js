'use strict';
/**
 * FinBotGraph — Grafo principal LangGraph para el bot financiero.
 *
 * Partes implementadas:
 *   1 (skeleton):  estado + checkpointer + clase FinBotGraph
 *   2 (text flow): RouterNode → TextFlowGraph (ParseNode → CommissionNode)
 *   3: CalculatorNode + VerifierNode + AskFieldsNode
 *   4: BankingQueryNode + ConfirmationNode (INTERRUPT)
 *   5: FileFlowGraph (cuadro_retorno, comprobante, banking_extraction)
 *   9: SupervisorNode — capa semántica entre router y subgrafos
 *
 * Partes pendientes:
 *   6: AsistenteModeGraph + VoiceFlowGraph
 *   7: CallbackFlowGraph
 *   8: MySQLCheckpointer completo (actualmente MemorySaver)
 *  10: cutover completo financial-bot-v2.js
 */

const { StateGraph } = require('@langchain/langgraph');
const { FinBotStateAnnotation } = require('./state');
const { MySQLCheckpointer } = require('./mysql-checkpointer');
const routerNode     = require('./nodes/router');
const supervisorNode = require('./nodes/supervisor-node');
const { textFlowGraph } = require('./subgraphs/text-flow-graph');
const { fileFlowGraph } = require('./subgraphs/file-flow-graph');

// ── Función de routing post-supervisor ───────────────────────────────────────
function routeFromSupervisor(state) {
  const action = state.nextAction;
  if (action === 'text_flow')      return 'text_flow';
  if (action === 'file_flow')      return 'file_flow';
  if (action === 'respond_info')   return 'respond_info';
  // file_flow también cubre asistente_flow por ahora
  if (action === 'asistente_flow') return 'file_flow';
  return '__end__';
}

// ── Nodo respond_info: responde preguntas informativas sin procesar operación ─
async function respondInfoNode(state) {
  const { draft } = state;
  const msg = draft?.toDecision?.params?.mensaje_respuesta;
  if (!msg) return { replyMessages: [] };
  return {
    replyMessages: [{ text: msg, opts: {} }],
    nextAction: 'done',
  };
}

// ── Construcción del grafo ────────────────────────────────────────────────────
function buildMainGraph(checkpointer) {
  const graph = new StateGraph(FinBotStateAnnotation)
    .addNode('router',       routerNode)
    .addNode('supervisor',   supervisorNode)
    .addNode('text_flow',    textFlowGraph)
    .addNode('file_flow',    fileFlowGraph)
    .addNode('respond_info', respondInfoNode)
    .addEdge('__start__', 'router')
    .addEdge('router', 'supervisor')
    .addConditionalEdges('supervisor', routeFromSupervisor, {
      text_flow:    'text_flow',
      file_flow:    'file_flow',
      respond_info: 'respond_info',
      __end__:      '__end__',
    })
    .addEdge('text_flow',    '__end__')
    .addEdge('file_flow',    '__end__')
    .addEdge('respond_info', '__end__');

  return graph.compile({ checkpointer });
}

// ── Clase principal ───────────────────────────────────────────────────────────
class FinBotGraph {
  /**
   * @param {object} opts
   * @param {import('mysql2/promise').Pool}  opts.pool
   * @param {import('grammy').Bot}           opts.bot
   * @param {object}                         opts.agents — { balanceManager, bankingManager, transactionOrchestrator, contextCompactor, contextManager, ... }
   */
  constructor({ pool, bot, agents = {} }) {
    this.pool   = pool;
    this.bot    = bot;
    this.agents = agents;

    const checkpointer = new MySQLCheckpointer(pool);
    this._app = buildMainGraph(checkpointer);
  }

  /**
   * Construye el estado inicial a partir del contexto de Telegram + extras de runtime.
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

    const photo    = msg?.photo;
    const document = msg?.document;
    const fileId   = document?.file_id ?? (photo ? photo[photo.length - 1]?.file_id : null);
    const mimeType = document?.mime_type ?? (photo ? 'image/jpeg' : null);
    const fileName = document?.file_name ?? null;

    return {
      chatId:   String(ctx.chat?.id ?? ''),
      userId:   from?.id ?? null,
      username: from?.username ?? null,
      messageType,
      inputText:          msg?.text ?? ctx.callbackQuery?.message?.text ?? null,
      inputFileId:        fileId,
      inputMimeType:      mimeType,
      inputFileName:      fileName,
      inputCallbackData:  ctx.callbackQuery?.data ?? null,
      inputCallbackMsgId: ctx.callbackQuery?.message?.message_id ?? null,
      ...extras,
    };
  }

  /**
   * Ejecuta el grafo con el contexto de Telegram.
   *
   * @param {import('grammy').Context} ctx
   * @param {object} extras — { client, modoChat, sessionEstado, draft,
   *                            _pool, _to, _mensajesRecientes, _saldo, _contextoCompactado }
   * @returns {Promise<object>} Estado final del grafo
   */
  async invoke(ctx, extras = {}) {
    const state  = FinBotGraph.buildState(ctx, {
      // Runtime deps inyectados en estado transient
      _pool:               extras._pool ?? this.pool,
      _to:                 extras._to   ?? this.agents.transactionOrchestrator ?? null,
      _mensajesRecientes:  extras._mensajesRecientes ?? [],
      _saldo:              extras._saldo ?? 0,
      _contextoCompactado: extras._contextoCompactado ?? null,
      ...extras,
    });
    const config = { configurable: { thread_id: String(ctx.chat?.id ?? '') } };
    return await this._app.invoke(state, config);
  }
}

module.exports = { FinBotGraph, buildMainGraph };
