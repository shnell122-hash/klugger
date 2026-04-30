import { api } from '@/lib/api';
import ClientsClient from './ClientsClient';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const clients = await api.getClients(500).catch(() => []);
  return <ClientsClient initialClients={clients} />;
}
