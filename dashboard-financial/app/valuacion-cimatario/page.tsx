'use client';

// Ruta de preview local para el dashboard de valuación del terreno Cimatario.
// Este archivo simplemente re-exporta el componente principal ubicado en cases/.
// 
// Cómo verlo en Chrome:
//   1. Abre PowerShell
//   2. cd C:\Users\noela\klugger\dashboard-financial
//   3. npm run dev     (usa el puerto 3020 según package.json)
//   4. En Chrome ve a:  http://localhost:3020/valuacion-cimatario
//
// El componente trae todos los datos embebidos (comps + valuation).
// Si el import relativo falla por TS, simplemente copia el contenido completo de 
// cases/terreno-cimatario-queretaro/ValuacionDashboard.tsx y pégalo aquí reemplazando este archivo.

export { default } from '../../cases/terreno-cimatario-queretaro/ValuacionDashboard';
