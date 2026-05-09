'use strict';
/**
 * FileFlowGraph — Subgrafo LangGraph para archivos (fotos y documentos).
 * LangGraph Parte 5.
 *
 * Flujo:
 *   __start__ → file_type_detector
 *   file_type_detector →(conditional)→
 *     cuadro_retorno  → __end__
 *     comprobante     → __end__
 *     banking         → __end__
 *     __end__         (archivo no reconocido)
 */

const { StateGraph } = require('@langchain/langgraph');
const { FinBotStateAnnotation } = require('../state');

const fileTypeDetectorNode  = require('../nodes/file-flow/file-type-detector-node');
const cuadroRetornoNode     = require('../nodes/file-flow/cuadro-retorno-node');
const comprobanteNode       = require('../nodes/file-flow/comprobante-node');
const bankingExtractionNode = require('../nodes/file-flow/banking-extraction-node');

function routeFromDetector(state) {
  const action = state.nextAction;
  if (action === 'cuadro_retorno')     return 'cuadro_retorno';
  if (action === 'comprobante')        return 'comprobante';
  if (action === 'banking_extraction') return 'banking_extraction';
  return '__end__';
}

const fileFlowGraph = new StateGraph(FinBotStateAnnotation)
  .addNode('file_type_detector',  fileTypeDetectorNode)
  .addNode('cuadro_retorno',      cuadroRetornoNode)
  .addNode('comprobante',         comprobanteNode)
  .addNode('banking_extraction',  bankingExtractionNode)
  .addEdge('__start__', 'file_type_detector')
  .addConditionalEdges('file_type_detector', routeFromDetector, {
    cuadro_retorno:     'cuadro_retorno',
    comprobante:        'comprobante',
    banking_extraction: 'banking_extraction',
    __end__:            '__end__',
  })
  .addEdge('cuadro_retorno',     '__end__')
  .addEdge('comprobante',        '__end__')
  .addEdge('banking_extraction', '__end__')
  .compile();

module.exports = { fileFlowGraph };
