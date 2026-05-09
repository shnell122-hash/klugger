'use strict';
/**
 * FinBotGraph — Grafo principal LangGraph para el bot financiero.
 */

const { StateGraph } = require('@langchain/langgraph');
const { FinBotStateAnnotation } = require('./state');
const { MySQLCheckpointer } = require('./mysql-checkpointer');
const routerNode = require('./nodes/router');
const { textFlowGraph } = require('./subgraphs/text-flow-graph');
const { fileFlowGraph } = require('./subgraphs/file-flow-graph');

function routeFromRouter(state) {
  const action = state.nextAction;
  if (action === 'text_flow') return 'text_flow';
  if (action === 'file_flow' || action === 'asistente_flow') return 'file_flow';
  return '__end__';
}

function buildMainGraph(checkpointer) {
  const graph = new StateGraph(FinBotStateAnnotation)
    .addNode('router', routerNode)
    .addNode('text_flow', textFlowGraph)
    .addNode('file_flow', fileFlowGraph)
    .addEdge('__start__', 'router')
    .addConditionalEdges('router', routeFromRouter, {
      text_flow: 'text_flow',
      file_flow: 'file_flow',
      __end__: '__end__',
    })
    .addEdge('text_flow', '__end__')
    .addEdge('file_flow', '__end__');

  return graph.compile({ checkpointer });
}

class FinBotGraph {
  constructor({ pool, bot, agents = {} }) {
    this.pool   = pool;
    this.bot    = bot;
    this.agents = agents;

    const checkpointer = new MySQLCheckpointer(pool);
    this._app = buildMainGraph(checkpointer);
  }

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

  async invoke(ctx, extras = {}) {
    const state  = FinBotGraph.buildState(ctx, extras);
    const config = { configurable: { thread_id: String(ctx.chat?.id ?? '') } };
    return await this._app.invoke(state, config);
  }
}

module.exports = { FinBotGraph, buildMainGraph };
