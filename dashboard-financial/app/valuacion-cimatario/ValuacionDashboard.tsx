'use client';

import React, { useState } from 'react';
import { MotionConfig, AnimatePresence, motion } from 'framer-motion';
import ValuacionTab from './components/ValuacionTab';
import DatabaseTab from './components/DatabaseTab';
import EstudioMercadoTab from './components/EstudioMercadoTab';
import MarketingTab from './components/MarketingTab';
import HbuTab from './components/HbuTab';
import AgentesTab from './components/AgentesTab';
import CostosTab from './components/CostosTab';
import { ErrorBoundary } from './components/ErrorBoundary';

// Order follows the investment narrative: value the asset, show the market
// that justifies it, show the highest-and-best-use case built on that
// market, then the supporting evidence (raw comps), then go-to-market and
// automation. Keep render order below in sync with this array.
const TABS = [
  { id: 'valuacion', label: '📊 Valuación' },
  { id: 'estudio-mercado', label: '📈 Estudio de Mercado' },
  { id: 'hbu', label: '🏗️ HBU/HBV + Estudio Colonia' },
  { id: 'database', label: '🗄️ Base de Datos' },
  { id: 'marketing', label: '📣 Marketing + Estudio' },
  { id: 'agentes', label: '🤖 Agentes + Outreach WA' },
  { id: 'costos', label: '💰 Costos API' },
] as const;

type TabId = typeof TABS[number]['id'];

// One motion language, reused everywhere in this file: quick ease-out on the
// way in, ease-in on the way out — never linear (that's reserved for loops).
const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EASE_IN: [number, number, number, number] = [0.4, 0, 1, 1];

// Tab content crossfade: short translateY + opacity, ease-out entering,
// ease-in leaving. Only transform/opacity — no layout properties.
const tabContentVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE_OUT } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15, ease: EASE_IN } },
};

export default function ValuacionDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('valuacion');

  return (
    // reducedMotion="user" makes every motion.* component in this subtree
    // (here and in KPICard) automatically honor the OS-level
    // prefers-reduced-motion setting — no per-component opt-out needed.
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen bg-[var(--bg)] text-[#e2e2f0] font-sans">
      {/* Persistent header — rendered exactly once, above the tab nav, and
          never inside the activeTab switch below. It carries every piece of
          "who/what is this" context (brand, title, subtitle, source link) so
          individual tabs don't need to restate it. Two rows: a slim sticky
          brand bar, and a hero that scrolls with the page — grouped under
          one semantic <header>, one mount, single source of truth. */}
      <header>
        <div className="sticky top-0 z-50 bg-[#0a0a0f]/95 backdrop-blur border-b border-[#1e1e2e]">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex items-center gap-3 min-w-0">
              <img src="/assets/klugger-logo-vectorized.png" alt="Klugger logo" className="h-12 sm:h-24 w-auto shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold text-lg tracking-[-0.3px] truncate">Klugger Inmuebles</div>
                <div className="text-[10px] text-gray-500 -mt-0.5 truncate">CASO • Cimatario, Querétaro</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs shrink-0">
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#111118] border border-[#1e1e2e] whitespace-nowrap">
                <div className="w-1.5 h-1.5 bg-[var(--brand-green)] rounded-full animate-pulse shrink-0" /> Datos Jun 2026
              </div>
              <a href="https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/" target="_blank" className="underline text-[var(--brand-violet)] hover:text-[var(--brand-violet-light)] whitespace-nowrap">Fuente mercado</a>
            </div>
          </div>
        </div>

        {/* Hero — same persistent header, second row. Scrolls away with the
            page (not sticky) so it doesn't eat viewport height on mobile. */}
        <div className="max-w-6xl mx-auto px-4 pt-6">
          <div className="uppercase text-xs tracking-[2px] text-[var(--brand-violet)] font-semibold mb-1">Valuación Comercial • Prototipo Roadmap</div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-[-2.2px] text-white break-words">Terreno 660 m² — Cimatario</h1>
          <p className="mt-2 text-base sm:text-lg text-gray-400 max-w-2xl">Precio comercial estimado usando <span className="font-medium text-white">mediana de comps vacantes</span> × m² + ajustes por CUS 2.4 / potencial 12 unidades.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="px-3 py-1 rounded-full bg-[#111118] border border-[#1e1e2e]">12 comps limpios (sin construcción)</span>
            <span className="px-3 py-1 rounded-full bg-[#111118] border border-[#1e1e2e]">HBU/HBV + Pro-forma DCF interactiva</span>
            <span className="px-3 py-1 rounded-full bg-[#111118] border border-[#1e1e2e]">Mobile-first • Recharts + glass</span>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 pt-6 pb-20 space-y-8">
        {/* Tab nav — active indicator slides between tabs via layoutId,
            so the "pill" travels from its old position instead of popping
            (the movement originates from the tab itself). */}
        <div className="flex border-b border-[#1e1e2e] mb-2 -mx-1 overflow-x-auto">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`relative px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
                  isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200'
                }`}>
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId="active-tab-indicator"
                    className="absolute left-0 right-0 -bottom-px h-0.5 bg-[var(--brand-violet)] rounded-full"
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content — crossfade + short vertical settle on switch.
            mode="wait" keeps only one tab's (possibly heavy: map, charts)
            content mounted at a time, avoiding an overlap flash. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            variants={tabContentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="space-y-8"
          >
            {activeTab === 'valuacion' && <ErrorBoundary label="Valuación"><ValuacionTab /></ErrorBoundary>}
            {activeTab === 'estudio-mercado' && <ErrorBoundary label="Estudio de Mercado"><EstudioMercadoTab onNavigateHbu={() => setActiveTab('hbu')} /></ErrorBoundary>}
            {activeTab === 'hbu' && <ErrorBoundary label="HBU/HBV"><HbuTab /></ErrorBoundary>}
            {activeTab === 'database' && <ErrorBoundary label="Base de Datos"><DatabaseTab /></ErrorBoundary>}
            {activeTab === 'marketing' && <ErrorBoundary label="Marketing"><MarketingTab /></ErrorBoundary>}
            {activeTab === 'agentes' && <ErrorBoundary label="Agentes"><AgentesTab /></ErrorBoundary>}
            {activeTab === 'costos' && <ErrorBoundary label="Costos API"><CostosTab /></ErrorBoundary>}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
    </MotionConfig>
  );
}
