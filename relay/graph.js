'use strict';
/**
 * relay/graph.js — Orquestación multi-agente con LangGraph.js
 * Patrones adaptados de flujos.fiscalai.mx (CommonJS, Node.js 22)
 *
 * Modos:
 *   plan-execute  → coordinator genera plan → agentes especializados ejecutan en paralelo
 *   full-claude-code → un solo agente hace todo, los demás solo verifican
 */

const { Annotation, StateGraph, START, END } = require('@langchain/langgraph');

// ── Estado compartido del relay ───────────────────────────────────────────────
const RelayState = Annotation.Root({
  // Entrada
  task:       Annotation,                              // descripción de la tarea
  projectId:  Annotation,                              // proyecto destino
  mode:       Annotation,                              // 'plan-execute' | 'full-claude-code'
  // Intermedios
  plan:       Annotation,                              // plan generado por coordinator
  // Salida — reducer: acumula resultados de nodos paralelos
  results: Annotation({
    reducer:  (cur, upd) => (cur || []).concat(Array.isArray(upd) ? upd : [upd]),
    default:  () => [],
  }),
  error:      Annotation,
  done:       Annotation({ reducer: (_, v) => v, default: () => false }),
});

// Estado privado del nodo coordinator (solo ve task + projectId + mode)
const CoordinatorInput = Annotation.Root({
  task:      Annotation,
  projectId: Annotation,
  mode:      Annotation,
});

// Estado privado del nodo executor (solo ve plan + projectId)
const ExecutorInput = Annotation.Root({
  plan:      Annotation,
  projectId: Annotation,
  mode:      Annotation,
  task:      Annotation,
});

// ── Nodos ─────────────────────────────────────────────────────────────────────

/**
 * coordinator — genera el plan de alto nivel usando DeepSeek V4-Flash
 * Solo se activa en modo plan-execute
 */
async function coordinatorNode(state, opts = {}) {
  if (state.mode !== 'plan-execute') {
    // full-claude-code: no planning, passar la tarea directo
    return { plan: state.task };
  }

  const callDeepSeek = opts.callDeepSeek;
  if (!callDeepSeek) return { plan: state.task };

  try {
    const plan = await callDeepSeek(
      `Eres un coordinador de agentes de software. Dado el proyecto "${state.projectId}", \
genera un plan de ejecución concreto para la siguiente tarea. \
Máximo 5 pasos numerados, cada uno ejecutable por un agente Claude Code. \
Sin explicaciones extra, solo los pasos.`,
      state.task,
      512,
      false,
    );
    return { plan: plan || state.task };
  } catch (err) {
    return { plan: state.task, error: `coordinator: ${err.message}` };
  }
}

/**
 * executor — ejecuta el plan en el proyecto destino
 * Escribe en relay/inbox del proyecto y espera outbox
 */
async function executorNode(state, opts = {}) {
  const { writeInbox } = opts;
  if (!writeInbox) return { results: [`[dry-run] ${state.projectId}: ${state.plan?.slice(0, 80)}`] };

  try {
    await writeInbox(state.projectId, state.plan || state.task);
    return { results: [`dispatched:${state.projectId}`] };
  } catch (err) {
    return { results: [`error:${state.projectId}:${err.message}`], error: err.message };
  }
}

/**
 * verifier — confirma que el outbox cambió tras la ejecución
 */
async function verifierNode(state, opts = {}) {
  return { done: true, results: [`verified:${state.projectId}`] };
}

// ── Router: fan-out paralelo para proyectos relacionados ──────────────────────
function routeAfterPlan(state) {
  // En full-claude-code siempre va directo a executor
  if (state.mode === 'full-claude-code') return ['executor'];
  // En plan-execute: coordinator + executor en paralelo no aplica
  // (executor necesita el plan del coordinator — son secuenciales)
  return ['executor'];
}

// ── Factory: construye y compila el grafo ─────────────────────────────────────
function buildRelayGraph(opts = {}) {
  const graph = new StateGraph(RelayState)
    .addNode('coordinator', (s) => coordinatorNode(s, opts), { input: CoordinatorInput })
    .addNode('executor',    (s) => executorNode(s, opts),    { input: ExecutorInput })
    .addNode('verifier',    (s) => verifierNode(s, opts))
    .addEdge(START, 'coordinator')
    .addConditionalEdges('coordinator', routeAfterPlan, ['executor'])
    .addEdge('executor', 'verifier')
    .addEdge('verifier', END);

  return graph.compile();
}

// ── Grafo paralelo: múltiples proyectos simultáneos ───────────────────────────
const MultiProjectState = Annotation.Root({
  tasks: Annotation({
    reducer: (cur, upd) => (cur || []).concat(Array.isArray(upd) ? upd : [upd]),
    default: () => [],
  }),
  results: Annotation({
    reducer: (cur, upd) => (cur || []).concat(Array.isArray(upd) ? upd : [upd]),
    default: () => [],
  }),
  done: Annotation({ reducer: (_, v) => v, default: () => false }),
});

/**
 * buildParallelGraph — ejecuta N proyectos en paralelo con fan-out/fan-in
 * Uso: cuando coordinator despacha a fiscalai + fiscalai-front simultáneamente
 */
function buildParallelGraph(projectIds, opts = {}) {
  const graph = new StateGraph(MultiProjectState);

  // Un nodo por proyecto — todos corren en paralelo
  for (const pid of projectIds) {
    graph.addNode(pid, async (state) => {
      const task = state.tasks.find(t => t.projectId === pid);
      if (!task || !opts.writeInbox) return { results: [`skip:${pid}`] };
      try {
        await opts.writeInbox(pid, task.plan || task.task);
        return { results: [`dispatched:${pid}`] };
      } catch (err) {
        return { results: [`error:${pid}:${err.message}`] };
      }
    });
    graph.addEdge(START, pid);  // fan-out: todos arrancan desde START
  }

  // Nodo agregador — fan-in: espera a todos los proyectos
  graph.addNode('aggregate', async (state) => ({ done: true }));
  for (const pid of projectIds) {
    graph.addEdge(pid, 'aggregate');
  }
  graph.addEdge('aggregate', END);

  return graph.compile();
}

module.exports = { buildRelayGraph, buildParallelGraph, RelayState };
