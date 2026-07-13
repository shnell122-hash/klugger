'use client';

import React from 'react';

interface State { error: Error | null; info: string }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode; label?: string }, State> {
  constructor(props: any) {
    super(props);
    this.state = { error: null, info: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error, info: '' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ error, info: info.componentStack ?? '' });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/5 p-6 text-sm space-y-3">
          <div className="font-bold text-red-400 text-base">Error en {this.props.label ?? 'componente'}</div>
          <div className="font-mono text-red-300 bg-[#0a0a0f] p-3 rounded-xl text-xs whitespace-pre-wrap break-all">
            {this.state.error.message}
          </div>
          {this.state.info && (
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer">Stack trace</summary>
              <pre className="mt-2 overflow-auto text-[10px]">{this.state.info}</pre>
            </details>
          )}
          <button onClick={() => this.setState({ error: null, info: '' })}
            className="px-3 py-1 rounded-lg bg-red-500/20 text-red-300 text-xs hover:bg-red-500/30">
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
