import { api } from '@/lib/api';
import AdminClient from './AdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const [opTypes, llmData] = await Promise.all([
    api.getOperationTypes(),
    api.getLLMCosts(30),
  ]);

  return (
    <main className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Administración</h1>
        <p className="text-sm text-gray-500">Configuración del sistema y costos LLM</p>
      </div>
      <AdminClient opTypes={opTypes} llmData={llmData} />
    </main>
  );
}
