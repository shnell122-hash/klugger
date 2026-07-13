'use client';

// Ruta de preview local para el dashboard de valuación del terreno Cimatario.
// El componente está copiado localmente en esta misma carpeta para máxima compatibilidad.
// Gateado con PIN (1206) para acceso restringido en klugger.shnell.mx.

import ValuacionDashboard from './ValuacionDashboard';
import PinGate from './PinGate';

export default function Page() {
  return (
    <PinGate>
      <ValuacionDashboard />
    </PinGate>
  );
}
