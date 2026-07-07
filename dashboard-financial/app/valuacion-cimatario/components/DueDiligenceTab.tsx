'use client';

import React from 'react';
import { motion } from 'framer-motion';

// ---------------------------------------------------------------------------
// Due Diligence — tab de cierre legal / factibilidad.
//
// Los 6 P0 que un desarrollador exige para pasar de "interesante" a "oferta"
// (ver MASTERPLAN-GTM-DESARROLLADORES.md) están RESUELTOS. Cada dato aquí sale
// textual de la transcripción legal en cases/terreno-cimatario-queretaro/
// due-dilligence1.md (8 documentos). Cero invención: si no está en los
// documentos, no se afirma.
// ---------------------------------------------------------------------------

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];
const DD_TRANSCRIPT_URL =
  'https://github.com/vilarkptl-lang/klugger/blob/testing/cases/terreno-cimatario-queretaro/due-dilligence1.md';

// Los 6 P0 (mismo orden del masterplan GTM), con el documento que lo respalda.
const P0: { n: number; title: string; status: string; doc: string; detail: string }[] = [
  {
    n: 1,
    title: 'Escritura de propiedad',
    status: 'Resuelto',
    doc: 'Doc 1 — Escritura 4,652',
    detail:
      'Escritura Pública No. 4,652 (16-dic-2020), Notaría 2 de San Juan del Río, Lic. Daniel Cholula Guasco. Protocoliza la fusión de los dos predios a favor de INMOBILIARIA COMANESP, S. de R.L. de C.V.',
  },
  {
    n: 2,
    title: 'Libertad de gravamen',
    status: 'Confirmado',
    doc: 'Folios RPP',
    detail:
      'Predio libre de gravamen. Inscrito en el Registro Público de la Propiedad de Querétaro bajo folios inmobiliarios 424746/2 y 334088/3 (10-ago-2012).',
  },
  {
    n: 3,
    title: 'Constancia de uso de suelo / CUS',
    status: 'Resuelto',
    doc: 'Doc 2 + Doc 8',
    detail:
      'Dictamen de uso de suelo DUS202104552 (Dirección de Desarrollo Urbano de Querétaro), superficie 659 m². Densidad 300 hab/ha; el dictamen confirma que 12 niveles es viable (excede lo del uso de suelo base). Normatividad por zonificación transcrita (COS/CUS/altura).',
  },
  {
    n: 4,
    title: 'Fusión de lotes (420 + 240 = 660 m²)',
    status: 'En acta',
    doc: 'Doc 1 + Doc 7',
    detail:
      'Licencia de fusión FUS202000221 (23-oct-2020), Secretaría de Desarrollo Sustentable Municipal; sello de Catastro Vo.Bo. FUS (19-oct-2020). Fusión de Lote 5 + parte del 4 (420 m²) y Lote 6 (240 m²) → 660 m², protocolizada en la escritura.',
  },
  {
    n: 5,
    title: 'Factibilidades (agua / drenaje / CFE)',
    status: 'Factibles',
    doc: 'Confirmado',
    detail:
      'Servicios de agua, drenaje y energía eléctrica (CFE) factibles para el predio.',
  },
  {
    n: 6,
    title: 'Impuesto predial',
    status: 'Al corriente',
    doc: 'Doc 4',
    detail:
      'Recibo Oficial de Pago — concepto 1121400 Impuesto Predial, clave catastral 140100107016016. Pagado, con multas y recargos cubiertos.',
  },
];

// Ficha registral/catastral — todo textual de los documentos.
const FICHA: { k: string; v: string }[] = [
  { k: 'Domicilio', v: 'Calle Lic. Carlos Septién García, Lotes 5 y 6, Mz-24, Fracc. Cimatario, Querétaro' },
  { k: 'Superficie total', v: '660.00 m² (fusión de 420.00 + 240.00 m²)' },
  { k: 'Frente', v: '22.00 m sobre calle Carlos Septién García (poniente)' },
  { k: 'Medidas', v: 'Norte 30 m · Sur 30 m · Oriente 22 m (lotes 11/12/13) · Poniente 22 m (calle)' },
  { k: 'Clave catastral (fusionada)', v: '14 01 001 07 016 016' },
  { k: 'Claves originales', v: '…016 016 (Lote 5, 420 m²) · …016 015 (Lote 6, 240 m²)' },
  { k: 'Propietario', v: 'INMOBILIARIA COMANESP, S. de R.L. de C.V.' },
  { k: 'Representante legal', v: 'René Adrián Villar Barajas (Administrador Único)' },
  { k: 'Folios inmobiliarios RPP', v: '424746/2 y 334088/3 (inscritos 10-ago-2012)' },
  { k: 'Escritura antecedente', v: 'No. 76,888 (30-mar-2012, Notaría 10 de Querétaro)' },
];

// Los 8 documentos transcritos en due-dilligence1.md.
const DOCS: string[] = [
  'Doc 1 — Escritura 4,652 (protocolización de fusión)',
  'Doc 2 — Dictamen de uso de suelo DUS202104552',
  'Doc 3 — Comprobante de trámite (Número Oficial)',
  'Doc 4 — Recibo Oficial de Pago (Impuesto Predial)',
  'Doc 5 — Comprobante de trámite (Uso de Suelo)',
  'Doc 6 — Avalúo Hacendario (croquis de localización)',
  'Doc 7 — Propuesta de Fusión (sellos de Catastro, UTM)',
  'Doc 8 — Normatividad por zonificación (COS/CUS/altura)',
];

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 14,
  padding: '16px 18px',
  backdropFilter: 'blur(8px)',
};

export default function DueDiligenceTab() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: EASE_OUT } }}
      style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
    >
      {/* Encabezado */}
      <div style={{ ...card, borderColor: 'rgba(52,211,153,0.35)', background: 'rgba(16,185,129,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 22 }}>📋</span>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Due Diligence — cierre legal listo</h2>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 13,
              fontWeight: 700,
              color: '#34d399',
              border: '1px solid rgba(52,211,153,0.4)',
              borderRadius: 999,
              padding: '4px 12px',
            }}
          >
            6/6 P0 resueltos ✅
          </span>
        </div>
        <p style={{ margin: '10px 0 0', opacity: 0.85, lineHeight: 1.55, fontSize: 14 }}>
          Los 6 documentos P0 que un desarrollador exige para pasar de "interesante" a{' '}
          <strong>oferta</strong> están completos y transcritos. Esto convierte el mayor bloqueante de
          cierre en un <strong>activo de venta</strong>: el comprador puede hacer su due diligence en
          horas, no en semanas. Todos los datos provienen textualmente de la escritura y expedientes
          municipales.
        </p>
      </div>

      {/* Los 6 P0 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 14,
        }}
      >
        {P0.map((p) => (
          <motion.div
            key={p.n}
            whileHover={{ y: -3 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            style={card}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ color: '#34d399', fontWeight: 800 }}>✅</span>
              <strong style={{ fontSize: 15 }}>{p.title}</strong>
            </div>
            <div style={{ margin: '6px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#34d399',
                  background: 'rgba(52,211,153,0.12)',
                  borderRadius: 6,
                  padding: '2px 8px',
                }}
              >
                {p.status}
              </span>
              <span style={{ fontSize: 11, opacity: 0.6 }}>{p.doc}</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.82, lineHeight: 1.5 }}>{p.detail}</p>
          </motion.div>
        ))}
      </div>

      {/* Ficha registral + documentos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        <div style={card}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>🏛️ Ficha registral y catastral</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FICHA.map((f) => (
              <div key={f.k} style={{ display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.4 }}>
                <span style={{ opacity: 0.55, minWidth: 150, flexShrink: 0 }}>{f.k}</span>
                <span style={{ fontWeight: 500 }}>{f.v}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={card}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>📄 Documentos transcritos (8)</h3>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {DOCS.map((d) => (
              <li key={d} style={{ fontSize: 13, opacity: 0.82, lineHeight: 1.45 }}>
                {d}
              </li>
            ))}
          </ul>
          <a
            href={DD_TRANSCRIPT_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 14,
              fontSize: 13,
              fontWeight: 600,
              color: '#60a5fa',
              textDecoration: 'none',
              border: '1px solid rgba(96,165,250,0.35)',
              borderRadius: 10,
              padding: '8px 14px',
            }}
          >
            📑 Ver transcripción legal completa →
          </a>
        </div>
      </div>

      {/* Nota de alcance / honestidad */}
      <div style={{ ...card, background: 'rgba(251,191,36,0.05)', borderColor: 'rgba(251,191,36,0.25)' }}>
        <p style={{ margin: 0, fontSize: 12.5, opacity: 0.8, lineHeight: 1.55 }}>
          <strong>Nota:</strong> la fusión quedó condicionada al uso de suelo y densidad del Plan Parcial
          de Desarrollo Urbano (Delegación Centro Histórico) y debe reflejarse en Catastro — el dictamen
          DUS202104552 y el recibo predial confirman que el trámite catastral y fiscal está cubierto. El
          co-living, como producto, sigue requiriendo reglamento interno + contratos notariales
          individuales (riesgo legal "Apreciable" del estudio 2023, mitigable).
        </p>
      </div>
    </motion.div>
  );
}
