'use client';

// Raíz de klugger.shnell.mx → catálogo del sistema de diseño (/style).
// Cimatario se movió a /casocimatario (gateado con PIN).
import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    window.location.replace('/style/');
  }, []);
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui', background: '#F4F6F5', color: '#3B3B3B' }}>
      <div style={{ textAlign: 'center' }}>
        <p>Klugger — sistema de diseño</p>
        <a href="/style/" style={{ color: '#2E9BD6' }}>Ir al catálogo →</a>
        <div style={{ marginTop: 12 }}>
          <a href="/casocimatario/" style={{ color: '#29BF5C', fontSize: 13 }}>Caso Cimatario (PIN)</a>
        </div>
      </div>
    </main>
  );
}
