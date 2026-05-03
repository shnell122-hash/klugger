'use strict';
/**
 * TextFlowGraph — Subgrafo para el flujo de texto.
 *
 * Partes implementadas:
 *   2: ParseNode → CommissionNode
 *   3: CommissionNode → CalculatorNode → VerifierNode → AskFieldsNode (este archivo)
 *
 * Pendiente:
 *   4: → BankingQueryNode → ConfirmationNode (INTERRUPT) → ApplyOperationNode
 */

const { StateGraph } = require('@langchain/langgraph');
const { FinBotStateAnnotation } = require('../state');
const parseNode       = require('../nodes/text-flow/parse-node');
const commissionNode  = require('../nodes/text-flow/commission-node');
const calculatorNode  = require('../nodes/text-flow/calculator-node');
const verifierNode    = require('../nodes/text-flow/verifier-node');
const askFieldsNode   = require('../nodes/text-flow/ask-fields-node');

// Router post-ParseNode: si falta tipo/monto → ask_fields; si hay datos → commission
function routeAfterParse(state) {
  if (state.error) return '__end__';
  const na = state.nextAction;
  if (na === 'ask_tipo' || na === 'ask_monto') {
    return 'ask_fields';
  }
  return 'commission';
}

// Router post-CommissionNode → calculator (Parte 3)
function routeAfterCommission(state) {
  if (state.error) return '__end__';
  return 'calculator';
}

// Router post-CalculatorNode: si hay error → __end__; si no → verifier
function routeAfterCalculator(state) {
  if (state.error) return '__end__';
  return 'verifier';
}

// Router post-VerifierNode
function routeAfterVerifier(state) {
  if (state.error) return '__end__';
  const na = state.nextAction;
  if (['ask_tipo', 'ask_monto', 'ask_entrega', 'ask_fields'].includes(na)) {
    return 'ask_fields';
  }
  // banking_query → Parte 4 añadirá BankingQueryNode; por ahora terminar
  return '__end__';
}

const textFlowGraph = new StateGraph(FinBotStateAnnotation)
  .addNode('parse',       parseNode)
  .addNode('commission',  commissionNode)
  .addNode('calculator',  calculatorNode)
  .addNode('verifier',    verifierNode)
  .addNode('ask_fields',  askFieldsNode)
  .addEdge('__start__', 'parse')
  .addConditionalEdges('parse', routeAfterParse, {
    commission:  'commission',
    ask_fields:  'ask_fields',
    __end__:     '__end__',
  })
  .addConditionalEdges('commission', routeAfterCommission, {
    calculator: 'calculator',
    __end__:    '__end__',
  })
  .addConditionalEdges('calculator', routeAfterCalculator, {
    verifier: 'verifier',
    __end__:  '__end__',
  })
  .addConditionalEdges('verifier', routeAfterVerifier, {
    ask_fields: 'ask_fields',
    __end__:    '__end__',
  })
  .addEdge('ask_fields', '__end__')
  .compile();

module.exports = { textFlowGraph };
