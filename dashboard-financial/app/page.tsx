'use client';

// Raíz del dominio klugger.shnell.mx → SOLO el caso de valuación Cimatario, gateado con PIN.
// La home financiera quedó respaldada en _backups/financial-home.tsx.bak (fuera de app/).

import ValuacionDashboard from './valuacion-cimatario/ValuacionDashboard';
import PinGate from './valuacion-cimatario/PinGate';

export default function Home() {
  return (
    <PinGate>
      <ValuacionDashboard />
    </PinGate>
  );
}
