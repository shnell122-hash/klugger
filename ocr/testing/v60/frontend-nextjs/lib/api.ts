export type User = {
  id: number;
  email: string;
  name: string;
  role: string;
  org_id: number | null;
};

export type Case = {
  case_id: string;
  case_name: string;
  description?: string;
  created_at?: string;
};

export type Artifact = {
  artifact_id: string;
  artifact_name: string;
  artifact_type: 'html' | 'contract' | 'brief' | 'analysis' | 'summary' | 'checklist';
  share_slug?: string;
  created_at?: string;
};

export type ChatEvent = {
  type: 'text' | 'tool_use' | 'tool_result' | 'done' | 'error';
  content?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_result?: string;
  cost_usd?: number;
  cost_mxn?: number;
};

export type DashboardData = {
  total_cost_mxn: number;
  total_price_mxn: number;
  by_user: Array<{
    email: string;
    name?: string;
    price_mxn: number;
    by_case: unknown[];
  }>;
  by_artifact_type: Record<string, { count: number; cost_mxn: number }>;
};

export type GraphData = {
  mermaid: string;
  summary: string;
  node_count: number;
  edge_count: number;
  cytoscape?: { elements: unknown[] };
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
    me:     () => request<User>('/auth/me'),
  },
  cases: {
    list: () => request<Case[]>('/v1/cases'),
    create: (case_name: string, description?: string) =>
      request<Case>('/v1/cases', {
        method: 'POST',
        body: JSON.stringify({ case_name, description }),
      }),
  },
  artifacts: {
    list:   (caseId: string) => request<Artifact[]>(`/v1/artifacts/${caseId}`),
    delete: (id: string) => request<void>(`/v1/artifacts/${id}`, { method: 'DELETE' }),
    downloadUrl: (id: string) => `/api/artifacts/${id}/download`,
  },
  dashboard: () => request<DashboardData>('/v1/dashboard'),
  graph: (caseId: string) =>
    request<GraphData>('/v1/tools/generate_graph', {
      method: 'POST',
      body: JSON.stringify({ case_id: caseId }),
    }),
};

// SSE streaming chat
export async function* chatStream(
  caseId: string,
  message: string,
  artifactType?: string,
): AsyncGenerator<ChatEvent> {
  const res = await fetch('/api/v1/chat/stream', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ case_id: caseId, message, artifact_type: artifactType }),
  });

  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try { yield JSON.parse(data) as ChatEvent; } catch {}
    }
  }
}
