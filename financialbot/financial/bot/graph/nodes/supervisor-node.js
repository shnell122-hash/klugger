'use strict';
/**
 * SupervisorNode — LangGraph Parte 9.
 *
 * Capa de inteligencia entre RouterNode y los subgrafos de texto/archivo.
 * Valida la decisión de routing, enriquece el draft con contexto semántico
 * y puede corregir malentendidos antes de que lleguen al flujo de ejecución.
 *
 * Lee:   state.nextAction, state.draft.toDecision, state._contextoCompactado,
 *        state._mensajesRecientes, state._to, state.inputText, state.sessionEstado
 * Escribe: state.nextAction (puede sobreescribir), state.draft (enriquecido),
 *          state.error (si hay problema irrecuperable)
 *
 * Casos de uso principales:
 *   1. Router dijo text_flow pero contexto muestra que la intención ya fue resuelta → ignorar
 *   2. Draft tiene tipo_operacion pero falta monto → pre-rellenar desde contexto compactado
 *   3. Alta carga de mensajes ambiguos → validar con TO antes de continuar
 *   4. Archivo recibido pero sesión tiene operación activa → decidir si interrumpir
 */

async function supervisorNode(state) {
  const {
    nextAction,
    draft,
    inputText,
    messageType,
    _to,
    _contextoCompactado,
    _mensajesRecientes,
    _saldo,
    client,
  } = state;

  const sessionEstado = draft?.sessionEstado ?? state.sessionEstado ?? 'idle';
  const toDecision    = draft?.toDecision ?? null;

  // ── 1. Pasar directo en flujos no textuales ───────────────────────────────
  // Archivos y callbacks no necesitan supervisión semántica
  if (nextAction === 'file_flow' || nextAction === 'callback_flow' ||
      nextAction === 'voice_flow' || nextAction === 'asistente_flow') {
    return {};
  }

  // ── 2. Si no hay acción, no hay nada que supervisar ───────────────────────
  if (!nextAction || nextAction === '__end__') {
    return {};
  }

  // ── 3. Enriquecer draft con contexto compactado ───────────────────────────
  // Si el contexto compactado tiene una operación activa y el draft no tiene tipo,
  // pre-llenar para evitar preguntas innecesarias al usuario
  const draftEnriquecido = {};

  if (_contextoCompactado?.operacion_activa && !draft?.tipo_operacion) {
    const op = _contextoCompactado.operacion_activa;
    if (op.tipo) draftEnriquecido.tipo_operacion = op.tipo;
    if (op.monto && !draft?.monto) {
      draftEnriquecido.monto      = op.monto;
      draftEnriquecido.tipo_monto = op.tipo_monto ?? 'neto';
    }
  }

  // ── 4. Validar con TO si la confianza del router es baja ──────────────────
  // Solo cuando: (a) es texto en idle, (b) no hay decisión TO previa de alta confianza,
  // (c) el TO está disponible
  const necesitaValidacion =
    nextAction === 'text_flow' &&
    sessionEstado === 'idle' &&
    (!toDecision || toDecision.confianza === 'baja') &&
    _to && inputText;

  if (necesitaValidacion) {
    try {
      const decision = await _to.rutear({
        estado:             sessionEstado,
        mensajesRecientes:  _mensajesRecientes ?? [],
        textoUsuario:       inputText,
        saldo:              _saldo ?? 0,
        nombre:             client?.nombre ?? null,
        contextoCompactado: _contextoCompactado,
      });

      if (decision.accion === 'ignorar') {
        // Supervisor cancela el routing — el mensaje no requiere acción
        return { nextAction: null };
      }

      if (decision.accion === 'responder_info') {
        return {
          nextAction: 'respond_info',
          draft: { toDecision: decision, ...draftEnriquecido },
        };
      }

      // Enriquecer draft con lo que el TO detectó
      if (decision.params?.tipo_operacion && !draft?.tipo_operacion) {
        draftEnriquecido.tipo_operacion = decision.params.tipo_operacion;
      }
      if (decision.params?.monto && !draft?.monto) {
        draftEnriquecido.monto      = decision.params.monto;
        draftEnriquecido.tipo_monto = decision.params.tipo_monto ?? 'neto';
      }

      return {
        draft: { toDecision: decision, ...draftEnriquecido },
      };
    } catch (e) {
      console.error('[SupervisorNode/TO]', e.message);
      // Si el TO falla, dejar pasar el routing original
    }
  }

  // ── 5. Aplicar enriquecimiento de draft si hay algo ───────────────────────
  if (Object.keys(draftEnriquecido).length > 0) {
    return { draft: draftEnriquecido };
  }

  return {};
}

module.exports = supervisorNode;
