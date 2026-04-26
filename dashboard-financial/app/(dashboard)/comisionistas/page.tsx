import { api } from '@/lib/api';
import ComisionistasClient from './ComisionistasClient';

export const dynamic = 'force-dynamic';

export default async function ComisionistasPage() {
  let comisionistas: import('@/lib/api').Comisionista[] = [], opTypes: import('@/lib/api').OperationType[] = [];
  try {
    [comisionistas, opTypes] = await Promise.all([
      api.getComisionistas(),
      api.getOperationTypes(),
    ]);
  } catch {}

  return (
    <main className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Comisionistas</h1>
        <p className="text-sm text-gray-500">Gestión de comisionistas y sus tasas por tipo de operación</p>
      </div>
      <ComisionistasClient initialData={comisionistas} opTypes={opTypes} />
    </main>
  );
}
