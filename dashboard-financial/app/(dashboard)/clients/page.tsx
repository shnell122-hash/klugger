import { api } from '@/lib/api';
import ClientsClient from './ClientsClient';


export default async function ClientsPage() {
  const clients = await api.getClients(500).catch(() => []);
  return <ClientsClient initialClients={clients} />;
}
