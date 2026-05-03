// API client para el dashboard financiero
// Todos los endpoints proxeados a localhost:3010/api/financial/*

const BASE = typeof window === 'undefined'
  ? `${process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3010'}/api/financial`
  : '/api/financial';

export type KPIs = {
  total_clientes: number;
  saldo_total_clientes: number;
  ops_hoy: number;
  volumen_hoy: number;
  comisiones_hoy: number;
  ops_pendientes: number;
  costo_llm_hoy: number;
  costo_llm_30d: number;
};

export type Client = {
  id: number;
  telegram_user_id: string;
  telegram_username: string;
  nombre: string;
  saldo: number;
  saldo_bruto: number;
  saldo_neto: number;
  saldo_pendiente: number;
  total_operaciones: number;
  ops_completadas: number;
  ops_pendientes: number;
  total_entrada: number;
  total_salida: number;
  ultima_operacion: string;
};

export type Chat = {
  chat_id: string;
  client_id: number | null;
  client_nombre: string | null;
  titulo: string | null;
  concepto: string | null;
  is_group: boolean;
  total_msgs: number;
  saldo: number | null;
  ultimo_texto: string | null;
  ultimo_msg_at: string | null;
};

export type ChatMessage = {
  id: number;
  chat_id: string;
  client_id: number | null;
  from_username: string | null;
  tipo: string;
  texto: string | null;
  file_name: string | null;
  es_bot: boolean;
  created_at: string;
};

export type PaymentConfirmation = {
  id: number;
  client_id: number;
  client_nombre: string;
  telegram_username: string;
  operation_id: number | null;
  tipo: 'factura' | 'comprobante' | 'texto' | 'manual';
  monto_bruto: number;
  monto_neto: number;
  tipo_operacion: string | null;
  comision_pct: number;
  notas: string | null;
  estado: 'pendiente' | 'confirmado' | 'rechazado';
  saldo_antes: number;
  saldo_despues: number;
  created_at: string;
};

export type Operation = {
  id: number;
  uuid: string;
  client_id: number;
  client_nombre: string;
  telegram_username: string;
  tipo_operacion: string;
  tipo_nombre: string;
  monto_bruto: number;
  comision_pct: number;
  costo_pct?: number | null;
  monto_neto: number;
  es_entrada: boolean;
  solicita_neto: boolean;
  tipo_entrega: string;
  instrucciones_pago: string | null;
  direccion_entrega: string | null;
  estado: 'draft' | 'pendiente' | 'confirmada' | 'completada' | 'cancelada';
  retorno_pagado: boolean;
  tiene_factura: boolean;
  saldo_antes: number | null;
  saldo_despues: number | null;
  notas: string | null;
  subtabla_json: string | null;
  created_at: string;
  updated_at: string;
};

export type VolumePoint = {
  fecha: string;
  total_ops: number;
  volumen_bruto: number;
  volumen_neto: number;
  comisiones: number;
};

export type OpsByType = {
  tipo_operacion: string;
  total: number;
  volumen: number;
  comisiones: number;
  comision_pct_avg: number;
};

export type LLMCostAgent = {
  agent_name: string;
  model: string;
  provider: string;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  total_calls: number;
  avg_duration_ms: number;
};

export type LLMCostPoint = {
  fecha: string;
  total_cost_usd: number;
  total_tokens: number;
  total_calls: number;
};

export type OperationType = {
  id: number;
  codigo: string;
  nombre: string;
  comision_pct: number;
  descripcion: string;
};

export type BankingAccount = {
  id: number;
  client_id: number;
  client_nombre: string;
  telegram_username: string;
  operation_id: number | null;
  tipo: 'CLABE' | 'tarjeta' | 'cuenta' | 'otro';
  numero: string;
  titular: string | null;
  banco: string | null;
  notas: string | null;
  created_at: string;
};

export type Comisionista = {
  id: number;
  nombre: string;
  telegram_user_id: string | null;
  email: string | null;
  notas: string | null;
  is_active: boolean;
  total_rates: number;
  created_at: string;
};

export type ComisionistaRate = {
  id: number;
  comisionista_id: number;
  tipo_operacion: string;
  pct: number;
};

export type Empresa = {
  id: number;
  nombre: string;
  rfc: string | null;
  origen: 'nuestra' | 'cliente';
  representante_nombre: string | null;
  notas: string | null;
  is_active: boolean;
  total_cuentas: number;
  created_at: string;
};

export type EmpresaCuenta = {
  id: number;
  empresa_id: number;
  banco: string;
  titular: string;
  clabe: string | null;
  num_cuenta: string | null;
  num_tarjeta: string | null;
  moneda: string;
  alias: string | null;
  is_active: boolean;
};

export type EmpresaCuentaFull = EmpresaCuenta & {
  empresa_nombre: string;
  empresa_rfc: string | null;
  empresa_origen: 'nuestra' | 'cliente';
};

export type Comision = {
  id: number;
  comisionista_id: number;
  comisionista_nombre: string;
  client_id: number;
  client_nombre: string;
  operation_id: number;
  tipo_operacion: string;
  monto_base: number;
  pct: number;
  monto_comision: number;
  pagado: boolean;
  fecha_pago: string | null;
  notas: string | null;
  created_at: string;
};

export type ClienteAsignado = {
  id: number;
  nombre: string;
  telegram_username: string;
  saldo: number;
  is_active: boolean;
};

export type ClientModel = {
  id: number;
  client_id: number;
  tipo_operacion: string;
  comision_pct: number;
  costo_pct?: number | null;
  es_credito: boolean;
  is_active: boolean;
  notas: string | null;
};

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? 'API error');
  return json.data as T;
}

async function put<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? 'API error');
  return json.data as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store' });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? 'API error');
  return json.data as T;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? 'API error');
  return json.data as T;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? 'API error');
  return json.data as T;
}

export const api = {
  getKPIs:          ()                   => get<KPIs>('/kpis'),
  getClients:       (limit = 50)         => get<Client[]>(`/clients?limit=${limit}`),
  getBalanceHistory:(id: number)         => get<unknown[]>(`/clients/${id}/balance-history`),
  getOperations:    (params = '')        => get<Operation[]>(`/operations${params ? `?${params}` : ''}`),
  marcarRetorno:    (id: number)         => post<{saldo_antes:number,saldo_despues:number}>(`/operations/${id}/retorno-pagado`),
  getVolumeTS:      (days = 30)          => get<VolumePoint[]>(`/analytics/volume?days=${days}`),
  getOpsByType:     (days = 30)          => get<OpsByType[]>(`/analytics/by-type?days=${days}`),
  getLLMCosts:      (days = 30)          => get<{byAgent:LLMCostAgent[],timeSeries:LLMCostPoint[]}>(`/analytics/llm-costs?days=${days}`),
  getOperationTypes:()                   => get<OperationType[]>('/config/operation-types'),
  updateOpType:     (codigo: string, comision_pct: number) =>
                                           patch(`/config/operation-types/${codigo}`, { comision_pct }),
  getBankingAccounts:      (limit = 200)  => get<BankingAccount[]>(`/banking-accounts?limit=${limit}`),
  getBankingByClient:      (id: number)   => get<BankingAccount[]>(`/clients/${id}/banking-accounts`),
  getPaymentConfirmations: (params = '')  => get<PaymentConfirmation[]>(`/payment-confirmations${params ? `?${params}` : ''}`),
  confirmarPago:           (id: number, body: { monto: number; tipo_operacion?: string; notas?: string }) =>
                                            post<{saldo_antes:number,saldo_despues:number}>(`/clients/${id}/confirmar-pago`, body),
  updateClientNombre:     (id: number, nombre: string) => patch(`/clients/${id}`, { nombre }),
  getEmpresaCuentasAll:   () => get<EmpresaCuentaFull[]>('/empresa-cuentas-all'),
  getComprobantImageUrl:  (id: number) => `${BASE}/payment-confirmations/${id}/image`,
  getChats:               (limit = 200)  => get<Chat[]>(`/chats?limit=${limit}`),
  getChatMessages:        (chatId: string, limit = 50) => get<ChatMessage[]>(`/chats/${chatId}/messages?limit=${limit}`),

  // Comisionistas
  getComisionistas:       ()             => get<Comisionista[]>('/comisionistas'),
  createComisionista:     (body: Partial<Comisionista>) => post<{id:number}>('/comisionistas', body),
  updateComisionista:     (id: number, body: Partial<Comisionista>) => patch(`/comisionistas/${id}`, body),
  getComisionistaRates:   (id: number)   => get<ComisionistaRate[]>(`/comisionistas/${id}/rates`),
  upsertComisionistaRates:(id: number, rates: {tipo_operacion:string; pct:number}[]) =>
                                           put(`/comisionistas/${id}/rates`, { rates }),
  deleteComisionistaRate: (id: number, tipo: string) => del(`/comisionistas/${id}/rates/${tipo}`),

  // Empresas
  getEmpresas:            ()             => get<Empresa[]>('/empresas'),
  createEmpresa:          (body: Partial<Empresa>) => post<{id:number}>('/empresas', body),
  updateEmpresa:          (id: number, body: Partial<Empresa>) => patch(`/empresas/${id}`, body),
  deleteEmpresa:          (id: number)   => del<void>(`/empresas/${id}`),
  getEmpresaCuentas:      (id: number)   => get<EmpresaCuenta[]>(`/empresas/${id}/cuentas`),
  createEmpresaCuenta:    (id: number, body: Partial<EmpresaCuenta>) => post<{id:number}>(`/empresas/${id}/cuentas`, body),
  updateEmpresaCuenta:    (id: number, body: Partial<EmpresaCuenta>) => patch(`/empresa-cuentas/${id}`, body),
  getEmpresaClientes:     (id: number) => get<ClienteAsignado[]>(`/empresas/${id}/clientes`),
  toggleEmpresaCliente:   (empresaId: number, clientId: number, isActive: boolean) =>
                            put(`/empresas/${empresaId}/clientes/${clientId}`, { is_active: isActive }),

  // Comisiones
  getComisiones:          (params = '')  => get<Comision[]>(`/comisiones${params ? `?${params}` : ''}`),
  pagarComision:          (id: number)   => post(`/comisiones/${id}/pagar`),

  // Modelos por cliente
  getClientModels:        (id: number)   => get<ClientModel[]>(`/clients/${id}/models`),
  upsertClientModel:      (clientId: number, tipo: string, body: Partial<ClientModel>) =>
                                           put(`/clients/${clientId}/models/${tipo}`, body),
  assignComisionista:     (clientId: number, comisionistaId: number | null) =>
                                           patch(`/clients/${clientId}/comisionista`, { comisionista_id: comisionistaId }),

  // Ajuste manual de saldo (positivo o negativo)
  ajusteManual: (clientId: number, monto: number, descripcion: string) =>
    post<{ saldo_antes: number; saldo_despues: number }>(`/clients/${clientId}/ajuste`, { monto, descripcion }),
};

export function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return '—';
  return Number(n).toLocaleString('es-MX', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export const TIPO_COLORS: Record<string, string> = {
  IAS:       '#7c3aed',
  TARJETAS:  '#3b82f6',
  SPEI:      '#10b981',
  EFECTIVO:  '#f59e0b',
  SINDICATO: '#ef4444',
};

export const ESTADO_COLORS: Record<string, string> = {
  draft:      '#6b7280',
  pendiente:  '#f59e0b',
  confirmada: '#3b82f6',
  completada: '#10b981',
  cancelada:  '#ef4444',
};
