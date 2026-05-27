import type { Metadata } from 'next';
import './globals.css';
import Header from './components/Header';
import TabNav from './components/TabNav';
import { SocketProvider } from './components/SocketProvider';

export const metadata: Metadata = {
  title: 'Relay Monitor — ia.vilarkptl.com',
  description: 'Pipeline reliability dashboard for relay-master',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ background: 'var(--bg)', minHeight: '100vh' }}>
        <SocketProvider>
          <Header />
          <TabNav />
          <main style={{ padding: '0 20px 40px', maxWidth: 1400, margin: '0 auto' }}>
            {children}
          </main>
        </SocketProvider>
      </body>
    </html>
  );
}
