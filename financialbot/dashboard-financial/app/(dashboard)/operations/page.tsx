import { api } from '@/lib/api';
import OperationsTableClient from './OperationsTableClient';

export const dynamic = 'force-dynamic';

export default async function OperationsPage() {
  const operations = await api.getOperations();
  return (
    <main className="p-6 max-w-[1600px] mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Operaciones</h1>
        <p className="text-sm text-gray-500">Historial completo con filtros y acciones</p>
      </div>
      <div className="glass rounded-xl p-5 border border-border">
        <OperationsTableClient initialData={operations} />
      </div>
    </main>
  );
}
