'use strict';
/**
 * TextFlowGraph — Subgrafo para el flujo de texto.
 *
 * Partes implementadas:
 *   2: ParseNode → CommissionNode (este archivo)
 *
 * Pendiente (se añaden los nodos a este mismo grafo):
 *   3: CommissionNode → CalculatorNode → VerifierNode → AskFieldsNode
 *   4: → BankingQueryNode → ConfirmationNode (INTERRUPT) → ApplyOperationNode
 *
 * La función de routing post-CommissionNode envía al __end__ temporalmente
 * hasta que Parte 3 añada CalculatorNode.
 */

const { StateGraph } = require('@langchain/langgraph');
const { FinBotStateAnnotation } = require('../state');
const parseNode      = require('../nodes/text-flow/parse-node');
const commissionNode = require('../nodes/text-flow/commission-node');

// Router post-CommissionNode (actualizado en Parte 3 para ir a CalculatorNode)
function routeAfterCommission(state) {
  if (state.error) return '__end__';
  // Parte 3 añadirá: return 'calculator'
  return '__end__';
}

// Router post-ParseNode: si falta tipo/monto → __end__ (AskFieldsNode en Parte 3)
function routeAfterParse(state) {
  if (state.error) return '__end__';
  const na = state.nextAction;
  if (na === 'ask_tipo' || na === 'ask_monto') {
    // En Parte 3 se añadirá AskFieldsNode; por ahora se termina
    return '__end__';
  }
  // Tenemos tipo + monto → ir a CommissionNode
  return 'commission';
}

const textFlowGraph = new StateGraph(FinBotStateAnnotation)
  .addNode('parse',      parseNode)
  .addNode('commission', commissionNode)
  .addEdge('__start__', 'parse')
  .addConditionalEdges('parse', routeAfterParse, {
    commission: 'commission',
    __end__:    '__end__',
  })
  .addConditionalEdges('commission', routeAfterCommission, {
    __end__: '__end__',
  })
  .compile();

module.exports = { textFlowGraph };
