import { api, fmt, type Chat } from '@/lib/api';

export const dynamic = 'force-dynamic';

function tiempoRelativo(iso: string | null) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'ahora';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return new Date(iso).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
}

export default async function ChatsPage() {
  let chats: Chat[] = [];
  try { chats = await api.getChats(200); } catch (_) {}

  const grupos   = chats.filter(c => c.is_group).length;
  const privados = chats.filter(c => !c.is_group).length;
  const conSaldo = chats.filter(c => c.saldo != null && c.saldo < 0).length;

  return (
    <main className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Chats</h1>
          <p className="text-sm text-gray-500">
            {privados} privados · {grupos} grupos
            {conSaldo > 0 && <span className="text-red-400 ml-2">· {conSaldo} con saldo negativo</span>}
          </p>
        </div>
      </div>

      {chats.length === 0 ? (
        <div className="glass rounded-xl border border-border p-12 text-center">
          <p className="text-4xl mb-3">💬</p>
          <p className="text-gray-400">Aún no hay conversaciones registradas.</p>
          <p className="text-xs text-gray-600 mt-1">Se registran automáticamente cuando el bot recibe mensajes.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {chats.map(chat => {
            const nombre   = chat.client_nombre ?? chat.titulo ?? `Chat ${chat.chat_id}`;
            const negativo = (chat.saldo ?? 0) < 0;
            return (
              <div
                key={chat.chat_id}
                className={`glass rounded-xl border p-4 flex items-start gap-4 transition-colors
                  ${negativo ? 'border-red-500/30 bg-red-950/10' : 'border-border'}`}
              >
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold
                  ${chat.is_group ? 'bg-purple-500/20 text-purple-400' : 'bg-accent/20 text-accent'}`}>
                  {chat.is_group ? '👥' : (nombre[0] ?? '?').toUpperCase()}
                </div>

                {/* Contenido */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-white">{nombre}</p>
                    {chat.is_group && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">grupo</span>
                    )}
                    {chat.concepto && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-border text-gray-400">{chat.concepto}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {chat.ultimo_texto ?? 'Sin mensajes de texto'}
                  </p>
                </div>

                {/* Meta */}
                <div className="text-right shrink-0 space-y-1">
                  <p className="text-[10px] text-gray-600">{tiempoRelativo(chat.ultimo_msg_at)}</p>
                  <p className="text-[10px] text-gray-600">{chat.total_msgs} msgs</p>
                  {chat.saldo != null && (
                    <p className={`text-xs font-mono font-semibold ${negativo ? 'text-red-400' : 'text-emerald-400'}`}>
                      ${fmt(chat.saldo)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
