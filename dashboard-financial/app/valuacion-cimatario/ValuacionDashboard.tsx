'use client';

import React, { useState } from 'react';
import ValuacionTab from './components/ValuacionTab';
import DatabaseTab from './components/DatabaseTab';
import MarketingTab from './components/MarketingTab';
import HbuTab from './components/HbuTab';
import AgentesTab from './components/AgentesTab';
import { ErrorBoundary } from './components/ErrorBoundary';

const TABS = [
  { id: 'valuacion', label: '📊 Valuación' },
  { id: 'database', label: '🗄️ Base de Datos' },
  { id: 'marketing', label: '📣 Marketing + Estudio' },
  { id: 'hbu', label: '🏗️ HBU/HBV + Estudio Colonia' },
  { id: 'agentes', label: '🤖 Agentes + Outreach WA' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function ValuacionDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('valuacion');

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e2e2f0] font-sans">
      {/* Sticky header */}
      <div className="sticky top-0 z-50 bg-[#0a0a0f]/95 backdrop-blur border-b border-[#1e1e2e]">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/assets/klugger-logo-vectorized.png" alt="Klugger logo" className="h-24 w-auto" />
            <div>
              <div className="font-semibold text-lg tracking-[-0.3px]">Klugger Inmuebles</div>
              <div className="text-[10px] text-gray-500 -mt-0.5">CASO • Cimatario, Querétaro</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#111118] border border-[#1e1e2e]">
              <div className="w-1.5 h-1.5 bg-[#10b981] rounded-full animate-pulse" /> Datos Jun 2026
            </div>
            <a href="https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/" target="_blank" className="underline text-[#7c3aed] hover:text-[#a78bfa]">Fuente mercado</a>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-6 pb-20 space-y-8">
        {/* Hero */}
        <div>
          <div className="uppercase text-xs tracking-[2px] text-[#7c3aed] font-semibold mb-1">Valuación Comercial • Prototipo Roadmap</div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-[-2.2px] text-white">Terreno 660 m² — Cimatario</h1>
          <p className="mt-2 text-lg text-gray-400 max-w-2xl">Precio comercial estimado usando <span className="font-medium text-white">mediana de comps vacantes</span> × m² + ajustes por CUS 2.4 / potencial 12 unidades.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="px-3 py-1 rounded-full bg-[#111118] border border-[#1e1e2e]">12 comps limpios (sin construcción)</span>
            <span className="px-3 py-1 rounded-full bg-[#111118] border border-[#1e1e2e]">HBU/HBV + Pro-forma DCF interactiva</span>
            <span className="px-3 py-1 rounded-full bg-[#111118] border border-[#1e1e2e]">Mobile-first • Recharts + glass</span>
          </div>
        </div>

        {/* Tab nav */}
        <div className="flex border-b border-[#1e1e2e] mb-2 -mx-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-all border-b-2 ${
                activeTab === tab.id ? 'border-[#7c3aed] text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="space-y-8">
          {activeTab === 'valuacion' && <ErrorBoundary label="Valuación"><ValuacionTab /></ErrorBoundary>}
          {activeTab === 'database' && <ErrorBoundary label="Base de Datos"><DatabaseTab /></ErrorBoundary>}
          {activeTab === 'marketing' && <ErrorBoundary label="Marketing"><MarketingTab /></ErrorBoundary>}
          {activeTab === 'hbu' && <ErrorBoundary label="HBU/HBV"><HbuTab /></ErrorBoundary>}
          {activeTab === 'agentes' && <ErrorBoundary label="Agentes"><AgentesTab /></ErrorBoundary>}
        </div>
      </div>
    </div>
  );
}
