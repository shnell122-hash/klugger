import { api } from '@/lib/api';
import EmpresasClient from './EmpresasClient';


export default async function EmpresasPage() {
  let empresas: import('@/lib/api').Empresa[] = [];
  try { empresas = await api.getEmpresas(); } catch {}

  return (
    <main className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Empresas</h1>
        <p className="text-sm text-gray-500">Catálogo de empresas prestadoras de servicio y sus cuentas bancarias</p>
      </div>
      <EmpresasClient initialData={empresas} />
    </main>
  );
}
