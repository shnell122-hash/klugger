'use client';

import React, { useState } from 'react';
import { fmtMoney } from '@/lib/format';

const TARGETS = [
  { id: 1, name: "Desarrollos QRO S. de R.L.", city: "Querétaro", focus: "multifamiliar 8-15u", phone: "+52 442 123 4567", priority: "alta" },
  { id: 2, name: "Inmobiliaria Cimatario Partners", city: "Querétaro", focus: "terrenos + JV", phone: "+52 442 987 6543", priority: "alta" },
  { id: 3, name: "CDMX Capital Inmuebles", city: "CDMX", focus: "nearshoring QRO", phone: "+52 55 5555 1212", priority: "media" },
  { id: 4, name: "Constructora El Encino", city: "Querétaro", focus: "densidad media", phone: "+52 442 333 2211", priority: "alta" },
  { id: 5, name: "Fondo Querétaro Growth", city: "CDMX", focus: "ROI 25%+ multifam", phone: "+52 55 8888 9900", priority: "media" },
];

export default function AgentesTab() {
  const [generated, setGenerated] = useState<Array<{ kind: string; text: string; id: number; generatedAt: string }>>([]);
  const [outreachLog, setOutreachLog] = useState<Array<{ id: number; target: string; msg: string; time: string; status: string }>>([]);
  const [waFilter, setWaFilter] = useState('');

  const filteredTargets = waFilter
    ? TARGETS.filter(t => (t.name + t.city + t.focus).toLowerCase().includes(waFilter.toLowerCase()))
    : TARGETS;

  const generateBatch = (type: string) => {
    const asking = fmtMoney(7000000);
    const adjusted = fmtMoney(7475608);
    let items: Array<{ kind: string; text: string }> = [];
    if (type === 'posts') {
      items = [
        { kind: 'Post FB/IG', text: `Terreno Cimatario 660m² CUS 2.4 → 12 unidades. Asking ${asking} (valor modelo ${adjusted}). ROI developer 35-45%. Ver simulación FinObra y dashboard: /casocimatario #Cimatario #Desarrollo` },
        { kind: 'Carrusel 4 slides', text: `1. El terreno 2. El potencial CUS 2.4 3. Comps vs nuestro asking 4. Contacto + link dashboard. Listo para 3 plataformas.` },
        { kind: 'LinkedIn', text: `Oportunidad JV / adquisición en Cimatario (QRO). Lote 660m² permite 12u. Modelo valúa 7.48M. Detalles en dashboard interactivo.` },
      ];
    } else if (type === 'emails') {
      items = [
        { kind: 'Email dev', text: `Hola [Nombre], vi que desarrollas multifamiliar en QRO. Tenemos lote Cimatario 660m² con CUS 2.4 (12 unidades posibles). Valor ajustado ${adjusted} vs asking ${asking}. Tiempo de venta optimizado 4-5 meses. ¿Te interesa el HBU simulado?` },
        { kind: 'Follow-up 2', text: `Recordatorio: El estudio de absorción en Cimatario muestra alta demanda. Adjunto extracto del dashboard con vector de precios y FinObra animado.` },
      ];
    } else if (type === 'videos') {
      items = [{ kind: 'Guion 60s', text: `Drone terreno → zoom a planos → animación FinObra (edificio creciendo a 4 niveles) → números: 12u, CUS, ROI. CTA: escanea QR o entra al dashboard.` }];
    }
    const stamped = items.map((it, idx) => ({ ...it, id: Date.now() + idx, generatedAt: new Date().toLocaleTimeString() }));
    setGenerated(prev => [...stamped, ...prev].slice(0, 12));
    alert(`Batch "${type}" generado (sim). Costo estimado: <$3 USD usando Gemini/DeepSeek via ocr-ruby-lease.`);
  };

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => alert('Copiado.')).catch(() => window.prompt('Copia manualmente:', text));
    } else {
      window.prompt('Copia manualmente:', text);
    }
  };

  const sendWA = (target: typeof TARGETS[0]) => {
    const msg = `Hola ${target.name}, terreno Cimatario 660m² CUS 2.4 → ~12 unidades. Valor modelo ${fmtMoney(7475608)} (asking 7M). Ver HBU interactivo: https://klugger.shnell.mx . ¿Nos reunimos?`;
    setOutreachLog(prev => [{ id: Date.now(), target: target.name, msg, time: new Date().toLocaleTimeString(), status: 'enviado (sim)' }, ...prev].slice(0, 8));
    alert(`Mensaje WA Business simulado a ${target.phone}\n\n${msg}\n\n(En prod: usa WA Business API + n8n o agente para broadcast real + tracking)`);
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold tracking-tight mb-1">🤖 Generación Masiva de Contenido con Agentes + Outreach WA</h2>
        <p className="text-sm text-gray-400">Stack barato: agentes relay, LiteLLM, vision. Datos live del caso Cimatario (valuación, HBU, 12u). Costo ultra bajo.</p>
      </section>

      <section className="glass rounded-3xl p-6 border border-[#1e1e2e]">
        <h3 className="font-semibold mb-3">Generador Masivo</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => generateBatch('posts')} className="px-4 py-2 rounded-2xl bg-[#111118] border border-[#7c3aed]/60 hover:bg-[#7c3aed]/10 text-sm">Generar 25 Posts + Carruseles</button>
          <button onClick={() => generateBatch('emails')} className="px-4 py-2 rounded-2xl bg-[#111118] border border-[#7c3aed]/60 hover:bg-[#7c3aed]/10 text-sm">Generar 15 Emails devs</button>
          <button onClick={() => generateBatch('videos')} className="px-4 py-2 rounded-2xl bg-[#111118] border border-[#7c3aed]/60 hover:bg-[#7c3aed]/10 text-sm">Generar guiones video</button>
          <button onClick={() => setGenerated([])} className="px-3 py-2 rounded-2xl text-xs border border-[#1e1e2e]">Limpiar</button>
        </div>
        <div className="text-xs text-gray-400 mb-2">DeepSeek/Gemini Flash vía agentes. Costo batch grande &lt; $5 USD. Datos interpolados del dashboard.</div>
        {generated.length > 0 && (
          <div className="space-y-3 mt-3">
            {generated.map((g, i) => (
              <div key={i} className="bg-[#0a0a0f] border border-[#1e1e2e] rounded-2xl p-4 text-sm">
                <div className="flex justify-between text-xs text-gray-500 mb-1"><span>{g.kind}</span><span>{g.generatedAt}</span></div>
                <div className="text-gray-200 whitespace-pre-wrap">{g.text}</div>
                <button onClick={() => copyToClipboard(g.text)} className="mt-2 text-xs underline text-[#a78bfa]">Copiar</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-xl font-semibold mb-3">Outreach Directo + WhatsApp Business</h3>
        <div className="glass rounded-3xl p-5 border border-[#1e1e2e] space-y-4">
          <input value={waFilter} onChange={e => setWaFilter(e.target.value)} placeholder="Filtrar targets (nombre, ciudad, foco)"
            className="bg-[#111118] border border-[#1e1e2e] rounded-2xl px-4 py-2 w-full text-sm" />
          <div className="text-xs uppercase tracking-widest text-gray-500">Targets (mock — expandir con LinkedIn scrape + DB)</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredTargets.map(t => (
              <div key={t.id} className="border border-[#1e1e2e] rounded-2xl p-4 bg-[#0f0f16] text-sm flex flex-col">
                <div className="font-medium">{t.name} <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1e1e2e]">{t.priority}</span></div>
                <div className="text-xs text-gray-400">{t.city} • {t.focus}</div>
                <div className="text-xs mt-1 font-mono text-gray-500">{t.phone}</div>
                <button onClick={() => sendWA(t)} className="mt-auto pt-2 text-xs self-start text-[#7c3aed] underline">Enviar WA Business (template dinámico)</button>
              </div>
            ))}
          </div>
          <div className="pt-3 border-t border-[#1e1e2e]">
            <div className="font-semibold text-sm mb-1">Log de envíos (simulado)</div>
            {outreachLog.length === 0 && <div className="text-xs text-gray-500">Sin envíos aún.</div>}
            {outreachLog.map((log, i) => (
              <div key={i} className="text-xs bg-[#111118] p-2 rounded mb-1 border-l-2 border-[#10b981]">
                {log.time} → {log.target}: {log.msg.substring(0, 90)}... <span className="text-[#10b981]">{log.status}</span>
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-400">Secuencia: 1. Intro + link. 2. HBU + FinObra. 3. CTA reunión/JV. WA Business ~$0.01/msg.</div>
        </div>
      </section>
    </div>
  );
}
