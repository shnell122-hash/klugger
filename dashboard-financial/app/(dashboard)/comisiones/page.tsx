import { api } from '@/lib/api';
import ComisionesClient from './ComisionesClient';


export default async function ComisionesPage() {
  let todas: import('@/lib/api').Comision[] = [], comisionistas: import('@/lib/api').Comisionista[] = [];
  try {
    [todas, comisionistas] = await Promise.all([
      api.getComisiones(),
      api.getComisionistas(),
    ]);
  } catch {}

  return (
    <main className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Comisiones</h1>
        <p className="text-sm text-gray-500">Seguimiento de comisiones por comisionista — pagadas y pendientes</p>
      </div>
      <ComisionesClient initialData={todas} comisionistas={comisionistas} />
    </main>
  );
}
