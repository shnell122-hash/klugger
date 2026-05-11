'use strict';
/**
 * Test standalone del TextFlowGraph (Partes 1 y 2).
 *
 * Uso (desde financial/bot/):
 *   node graph/test-text-flow.js
 *
 * No requiere Telegram ni DB activa para los tests básicos.
 * Los tests de comisión personalizada (por cliente) necesitan pool real.
 *
 * Salida esperada:
 *   T01 ✅ parseCommand  — tipo=IAS, monto=23000, tipo_monto=neto
 *   T02 ✅ parseNatural  — tipo=SPEI, monto=50000, tipo_monto=neto
 *   T03 ✅ commission    — comision_pct=0.055
 *   T04 ✅ routerText    — nextAction=text_flow
 *   T05 ✅ routerVoice   — nextAction=voice_flow
 *   T06 ✅ routerAsist   — nextAction=asistente_flow (modo asistente + foto)
 *   T07 ✅ routerIgnore  — nextAction=null (texto irrelevante)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { FinBotStateAnnotation } = require('./state');
const parseNode      = require('./nodes/text-flow/parse-node');
const commissionNode = require('./nodes/text-flow/commission-node');
const routerNode     = require('./nodes/router');

let passed = 0;
let failed = 0;

function assert(label, actual, expected, key) {
  const val = key ? key.split('.').reduce((obj, k) => obj?.[k], actual) : actual;
  if (val === expected) {
    console.log(`  ✅ ${label} — ${key ?? ''}=${JSON.stringify(val)}`);
    passed++;
  } else {
    console.error(`  ❌ ${label} — esperado ${key ?? ''}=${JSON.stringify(expected)}, obtenido=${JSON.stringify(val)}`);
    failed++;
  }
}

function assertTruthy(label, val, note = '') {
  if (val) {
    console.log(`  ✅ ${label}${note ? ' — ' + note : ''}`);
    passed++;
  } else {
    console.error(`  ❌ ${label} — esperado truthy, obtenido=${JSON.stringify(val)}`);
    failed++;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeState(overrides = {}) {
  // Construir estado mínimo con defaults del Annotation
  return {
    chatId: '123456',
    userId: 1,
    username: 'test',
    sessionId: null,
    sessionEstado: 'idle',
    modoChat: 'normal',
    messageType: 'text',
    inputText: null,
    inputBuffer: null,
    inputMimeType: null,
    inputFileName: null,
    inputCallbackData: null,
    inputCallbackMsgId: null,
    client: { id: 1, nombre: 'Test User', saldo: '0.00' },
    draft: {},
    commission: null,
    bankingAccounts: [],
    detectedFile: null,
    cuadroRetorno: null,
    transcripcion: null,
    verificationResult: null,
    replyMessages: [],
    nextAction: null,
    error: null,
    _pool: null, // no DB en tests básicos
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n── T01: ParseNode con /operacion IAS neto 23000 ─────────────────────────────');
  {
    const state = makeState({ inputText: '/operacion IAS neto 23000' });
    const result = await parseNode(state);
    assert('T01', result, 'IAS',   'draft.tipo_operacion');
    assert('T01', result, 23000,   'draft.monto');
    assert('T01', result, 'neto',  'draft.tipo_monto');
    assert('T01', result, true,    'draft.solicita_neto');
  }

  console.log('\n── T02: ParseNode con texto libre SPEI ──────────────────────────────────────');
  {
    const state = makeState({ inputText: 'quiero hacer un SPEI de 50 mil neto' });
    const result = await parseNode(state);
    assert('T02', result, 'SPEI',  'draft.tipo_operacion');
    assert('T02', result, 50000,   'draft.monto');
    assert('T02', result, 'neto',  'draft.tipo_monto');
  }

  console.log('\n── T03: CommissionNode IAS (sin pool → comisión default) ────────────────────');
  {
    const state = makeState({
      draft: { tipo_operacion: 'IAS', monto: 23000, tipo_monto: 'neto' },
      client: { id: 1, saldo: '0.00' },
    });
    const result = await commissionNode(state);
    assertTruthy('T03 commission set', result.commission, `pct_efectivo=${result.commission?.pct_efectivo}`);
    assert('T03', result, 0.055, 'draft.comision_pct');
  }

  console.log('\n── T04: RouterNode — texto con /operacion → text_flow ────────────────────────');
  {
    const state = makeState({ inputText: '/operacion IAS neto 23000', messageType: 'text' });
    const result = await routerNode(state);
    assert('T04', result, 'text_flow', 'nextAction');
  }

  console.log('\n── T05: RouterNode — voice → voice_flow ──────────────────────────────────────');
  {
    const state = makeState({ messageType: 'voice' });
    const result = await routerNode(state);
    assert('T05', result, 'voice_flow', 'nextAction');
  }

  console.log('\n── T06: RouterNode — modo asistente + foto → asistente_flow ──────────────────');
  {
    const state = makeState({ modoChat: 'asistente', messageType: 'photo' });
    const result = await routerNode(state);
    assert('T06', result, 'asistente_flow', 'nextAction');
  }

  console.log('\n── T07: RouterNode — texto irrelevante → null ────────────────────────────────');
  {
    const state = makeState({ inputText: 'hola cómo estás', messageType: 'text' });
    const result = await routerNode(state);
    assert('T07', result, null, 'nextAction');
  }

  console.log('\n── T08: ParseNode — texto libre ambiguo → necesita tipo ──────────────────────');
  {
    const state = makeState({ inputText: 'quiero enviar dinero' }); // sin tipo, sin monto
    const result = await parseNode(state);
    assert('T08 sessionEstado', result, 'esperando_tipo', 'sessionEstado');
  }

  console.log('\n── T09: ParseNode — continua sesión esperando_tipo ───────────────────────────');
  {
    const state = makeState({
      inputText: 'IAS',
      draft: { sessionEstado: 'esperando_tipo', monto: 10000 },
    });
    // Simular que sessionEstado viene del draft
    state.draft.sessionEstado = 'esperando_tipo';
    const result = await parseNode({ ...state, sessionEstado: undefined });
    assert('T09 tipo extraído', result, 'IAS', 'draft.tipo_operacion');
  }

  console.log('\n── T10: ParseNode — texto con monto en miles (100k) ─────────────────────────');
  {
    const state = makeState({ inputText: '/operacion TARJETAS bruto 100k' });
    const result = await parseNode(state);
    assert('T10', result, 'TARJETAS', 'draft.tipo_operacion');
    assert('T10', result, 100000,     'draft.monto');
    assert('T10', result, 'bruto',    'draft.tipo_monto');
  }

  // ── Resumen ───────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Resultado: ${passed} ✅ pasados, ${failed} ❌ fallidos de ${passed + failed} tests`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
