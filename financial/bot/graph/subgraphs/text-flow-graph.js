'use strict';
/**
 * TextFlowGraph — Subgrafo para el flujo de texto.
 *
 * Partes implementadas:
 *   2: ParseNode → CommissionNode
 *   3: CommissionNode → CalculatorNode → VerifierNode → AskFieldsNode
 *   4: VerifierNode → BankingQueryNode → ConfirmationNode (INTERRUPT) → ApplyOperationNode
 */

const { StateGraph } = require('@langchain/langgraph');
const { FinBotStateAnnotation } = require('../state');
const parseNode          = require('../nodes/text-flow/parse-node');
const commissionNode     = require('../nodes/text-flow/commission-node');
const calculatorNode     = require('../nodes/text-flow/calculator-node');
const verifierNode       = require('../nodes/text-flow/verifier-node');
const askFieldsNode      = require('../nodes/text-flow/ask-fields-node');
const bankingQueryNode   = require('../nodes/text-flow/banking-query-node');
const confirmationNode   = require('../nodes/text-flow/confirmation-node');
const applyOperationNode = require('../nodes/text-flow/apply-operation-node');

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
  return 'banking_query';
}

// Router post-BankingQueryNode
function routeAfterBankingQuery(state) {
  if (state.error) return '__end__';
  const na = state.nextAction;
  if (na === 'await_banking') return '__end__'; // esperar respuesta del usuario
  return 'confirmation';
}

// Router post-ConfirmationNode
// - Primera llamada: nextAction='await_confirmation' → pausar (END), bot enviará poll
// - Reanudación con poll respuesta: nextAction='apply_operation' | 'cancel' | 'edit_field'
function routeAfterConfirmation(state) {
  const na = state.nextAction;
  if (na === 'apply_operation')  return 'apply_operation';
  if (na === 'cancel')           return '__end__';
  if (na === 'edit_field')       return '__end__'; // Parte 7: EditFieldGraph
  if (na === 'confirmation')     return 'confirmation'; // re-run (cambio de estado)
  return '__end__'; // await_confirmation → fin, bot envía poll y espera
}

const textFlowGraph = new StateGraph(FinBotStateAnnotation)
  .addNode('parse',           parseNode)
  .addNode('commission',      commissionNode)
  .addNode('calculator',      calculatorNode)
  .addNode('verifier',        verifierNode)
  .addNode('ask_fields',      askFieldsNode)
  .addNode('banking_query',   bankingQueryNode)
  .addNode('confirmation',    confirmationNode)
  .addNode('apply_operation', applyOperationNode)
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
    ask_fields:    'ask_fields',
    banking_query: 'banking_query',
    __end__:       '__end__',
  })
  .addEdge('ask_fields', '__end__')
  .addConditionalEdges('banking_query', routeAfterBankingQuery, {
    confirmation: 'confirmation',
    __end__:      '__end__',
  })
  .addConditionalEdges('confirmation', routeAfterConfirmation, {
    apply_operation: 'apply_operation',
    __end__:         '__end__',
  })
  .addEdge('apply_operation', '__end__')
  .compile();

module.exports = { textFlowGraph };
