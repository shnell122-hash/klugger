'use client';

import React from 'react';

export default function MarketingTab() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold tracking-tight mb-2">Estudio de Mercado — Terreno Cimatario 660m²</h2>
        <div className="glass rounded-3xl p-6 border border-[#1e1e2e] space-y-4 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs uppercase text-gray-500">Producto</div>
              <div className="font-semibold">Terreno plano 660 m² con alto potencial de desarrollo multifamiliar (COS 0.60 / CUS 2.4 → ~12 apartamentos en 4 niveles).</div>
            </div>
            <div>
              <div className="text-xs uppercase text-gray-500">Ubicación &amp; Plusvalía</div>
              <div>Lic. Carlos Septien 53, Cimatario, Querétaro (CP 76030). Zona consolidada con alta plusvalía, cerca de Centro Sur, Parque Nacional Cimatario y vías de acceso a CDMX.</div>
            </div>
            <div>
              <div className="text-xs uppercase text-gray-500">Precio &amp; Comparables</div>
              <div>Asking $7,000,000 MXN (~$10,606 /m²). <br />Mediana comps limpios: $7,705 /m². <br />Promedio Lamudi área Cumbres/Cimatario (May 2026): $6,433 /m². <br />Valor ajustado por CUS (modelo): $7.48M (rango $6.88M–$8.07M).</div>
            </div>
          </div>
          <div>
            <div className="font-semibold text-[#a78bfa] mb-1">Análisis de Oportunidad</div>
            <ul className="list-disc pl-5 space-y-1 text-gray-300">
              <li>La mayoría de comps son lotes para vivienda unifamiliar. Este permite densidad 12 unidades → prima de +35-40% justificada por CUS 2.4.</li>
              <li>Demanda 2026 en QRO: mercado dinámico por nearshoring. Lotes grandes para desarrollo escasos y con due diligence más largo (4-9 meses típico).</li>
              <li>Buyer persona principal: Desarrolladores locales y de CDMX (8-15 unidades). Secundario: inversionistas para JV con constructor.</li>
              <li>Riesgo principal: Precio por m² por encima de mediana (requiere storytelling fuerte del potencial + datos de valuación).</li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-xl font-semibold mb-3">🏛️ Estrategias Convencionales</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { title: "Agencias y Portales Tradicionales (MLS)", desc: "Listar en Inmuebles24, Lamudi, Vivanuncios, EasyBroker + colaboración con 3-4 brokers locales top en Querétaro.", cost: "Comisión + fees portales ~$15-30k MXN/mes", timeline: "30-90 días", kpi: "Leads de calidad / visitas" },
            { title: "Publicidad Impresa y Exterior", desc: "Anuncios en periódicos locales, revistas de bienes raíces, lonas en avenidas de alto tráfico.", cost: "Lona $4-8k + alquiler mensual $8-15k", timeline: "Inmediato + 30 días", kpi: "Llamadas / QR escaneos" },
            { title: "Eventos Presenciales y Open House", desc: "Días de visita con renders 3D del proyecto. Invitar arquitectos, constructores y desarrolladores locales.", cost: "$5-12k (renders + coffee + impresión)", timeline: "Eventos semanales 4-6 sem", kpi: "Asistencia + leads calificados" },
            { title: "Red de Contactos Broker / Despachos", desc: "Visitas 1:1 a 15-20 despachos de arquitectura, constructoras medianas y bancos con crédito puente en QRO.", cost: "Tiempo + materiales ~$3k", timeline: "2-4 semanas intensivas", kpi: "Reuniones → ofertas" },
          ].map((item, i) => (
            <div key={i} className="glass rounded-2xl p-5 border border-[#1e1e2e]">
              <div className="font-semibold text-lg mb-2">{item.title}</div>
              <div className="text-gray-300 mb-3 text-sm">{item.desc}</div>
              <div className="text-xs grid grid-cols-2 gap-y-1">
                <div className="text-gray-500">Costo:</div><div>{item.cost}</div>
                <div className="text-gray-500">Timeline:</div><div>{item.timeline}</div>
                <div className="text-gray-500">KPI:</div><div>{item.kpi}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xl font-semibold mb-3">🚀 Estrategias No Convencionales (Data-Driven + Agentic)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { title: "Landing + Dashboard Interactivo", desc: "Usar este dashboard como principal herramienta de venta. QR en el terreno apunta aquí. Visitantes ven valuación en tiempo real, comps, tiempo estimado de venta.", cost: "Bajo (ya desarrollado) + hosting ~$0-500/mes", timeline: "Inmediato", kpi: "Tiempo en página + leads + conversión" },
            { title: "Campañas Pagadas Hipersegmentadas (Meta + LinkedIn)", desc: "Ads a audiencias: 'desarrolladores inmobiliarios Querétaro', 'inversionistas CDMX', nearshoring. Lookalike de visitantes al listing original.", cost: "$8k-25k MXN/mes (test 2 semanas)", timeline: "Lanzamiento en 48h", kpi: "CPL < $150, ROAS > 3x" },
            { title: "Generación Masiva de Contenido con Agentes", desc: "30-50 piezas: posts, carruseles, emails, guiones de video con números duros de valuación y potencial 12 unidades. Publicar en 3 plataformas.", cost: "Bajo (API ~$200-600 para batch grande)", timeline: "Producción en 1 semana", kpi: "Engagement rate + shares devs" },
            { title: "Outreach Directo + WhatsApp Business", desc: "80-120 desarrolladores y fondos en QRO/CDMX. Mensajes personalizados + dashboard como PDF. Secuencia 3 follow-ups.", cost: "Tiempo + herramienta ~$1-3k", timeline: "Campaña 3 semanas", kpi: "Tasa respuesta > 8%" },
            { title: "Contenido de Video + Influencers Locales", desc: "Drone del terreno + renders 3D edificio 12u. Colaboración con 2-3 creadores locales. Webinars 'Cómo lograr 35%+ utilidad en lote Cimatario 2026'.", cost: "$15-40k (producción + fees)", timeline: "Producción 10 días + 4 sem distribución", kpi: "Vistas + leads desde video" },
            { title: "SEO + Retargeting + Guerrilla QR", desc: "Optimizar para 'terreno desarrollo multifamiliar Cimatario'. Lona grande en el terreno con QR gigante al dashboard.", cost: "$3-7k guerrilla + $5-15k/mes ads", timeline: "Instalación inmediata", kpi: "Escaneos QR + tráfico orgánico" },
          ].map((item, i) => (
            <div key={i} className="glass rounded-2xl p-5 border border-[#1e1e2e] flex flex-col">
              <div className="font-semibold text-lg mb-2 text-[#a78bfa]">{item.title}</div>
              <div className="text-gray-300 flex-1 mb-3 text-sm">{item.desc}</div>
              <div className="text-xs border-t border-[#1e1e2e] pt-3 grid grid-cols-1 gap-y-0.5">
                <div><span className="text-gray-500">Costo:</span> {item.cost}</div>
                <div><span className="text-gray-500">Timeline:</span> {item.timeline}</div>
                <div><span className="text-gray-500">KPI:</span> {item.kpi}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xl font-semibold mb-3">Plan Integrado (8-10 semanas)</h3>
        <div className="space-y-3 text-sm">
          <div className="glass p-4 rounded-2xl border border-[#1e1e2e]"><strong>Fase 1 (Sem 1-2):</strong> Landing + QR en sitio + outreach directo 40 devs + primer batch de contenido por agentes. ~$12k.</div>
          <div className="glass p-4 rounded-2xl border border-[#1e1e2e]"><strong>Fase 2 (Sem 3-5):</strong> Ads pagados + webinars + eventos + partnerships 2 constructoras. ~$35k.</div>
          <div className="glass p-4 rounded-2xl border border-[#1e1e2e]"><strong>Fase 3 (Sem 6-10):</strong> Escalar lo que funcionó + JV negotiations + remarketing agresivo. Meta: 8-12 leads calificados + 1 oferta firme.</div>
        </div>
      </section>
    </div>
  );
}
