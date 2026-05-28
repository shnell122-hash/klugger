const BASE = process.env.NEXT_PUBLIC_API_URL || 'https://ia.vilarkptl.com';

export async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export interface Agent {
  id: string;
  name: string;
  status: 'working' | 'idle' | 'inactive';
  current_task: string | null;
  cost_today: number;
  last_activity: string | null;
  claude_model: string;
}

export interface DispatchTask {
  id: string;
  project: string;
  title: string;
  status: 'pending' | 'dispatched' | 'completed' | 'failed';
  depth: number;
  requester: string;
  created_at: string;
  dispatched_at: string | null;
  completed_at: string | null;
  exit_code: number | null;
  duration_sec: number | null;
}

export interface PipelineStat {
  project: string;
  total: number;
  completed: number;
  failed: number;
  stuck: number;
  success_rate_pct: number;
  avg_min_completed: number | null;
}

export interface AgentSession {
  id: string;
  project_name: string;
  chat_source: string | null;
  tool_call_count: number;
  total_cost_usd: number;
  is_active: boolean;
  resumed: boolean;
  started_at: string;
  ended_at: string | null;
}

export interface ResumeStats {
  today: { total: number; resumed: number; rate_pct: number };
  by_project: Array<{ project_name: string; total_sessions: number; resumed_sessions: number; resume_rate_pct: number }>;
}

export interface RelayAlert {
  id: number;
  alert_type: string;
  project_id: string | null;
  severity: 'warning' | 'critical' | 'info';
  title: string;
  details: string | null;
  auto_fixed: boolean;
  resolved: boolean;
  created_at: string;
}
