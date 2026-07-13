import { api } from '@/lib/api';
import ScoresClient from './ScoresClient';


export default async function ScoresPage() {
  let data = null;
  try { data = await api.getLearningEpisodes(300, 0); } catch (_) {}

  return (
    <main className="p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Scores — Curriculum Learning</h1>
        <p className="text-sm text-gray-500">Historial de episodios del conversation-engine MTProto</p>
      </div>
      <ScoresClient initialData={data} />
    </main>
  );
}
