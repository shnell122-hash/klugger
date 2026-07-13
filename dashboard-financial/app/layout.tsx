import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Klugger · Valuación Cimatario',
  description: 'Estudio de valuación — Terreno Cimatario, Querétaro (Lic. Carlos Septién 53)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body className="bg-bg text-white antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
