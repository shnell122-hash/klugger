'use client';

import { useState, useEffect, useRef } from 'react';
import { api, fmt, type Chat, type ChatMessage } from '@/lib/api';

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

function formatMsgTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function formatMsgDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

export default function ChatsClient({ initialChats }: { initialChats: Chat[] }) {
  const [chats]         = useState<Chat[]>(initialChats);
  const [selected, setSelected] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading]   = useState(false);
  const [limit, setLimit]       = useState(50);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    api.getChatMessages(selected.chat_id, limit)
      .then(msgs => {
        setMessages(msgs);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      })
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, [selected, limit]);

  // Agrupar mensajes por fecha
  const grouped: { date: string; msgs: ChatMessage[] }[] = [];
  for (const msg of messages) {
    const date = new Date(msg.created_at).toDateString();
    const last = grouped[grouped.length - 1];
    if (last && last.date === date) {
      last.msgs.push(msg);
    } else {
      grouped.push({ date, msgs: [msg] });
    }
  }

  const grupos   = chats.filter(c => c.is_group).length;
  const privados = chats.filter(c => !c.is_group).length;

  return (
    <main className="p-6 max-w-[1400px] mx-auto h-[calc(100vh-6rem)]">
      <div className="flex gap-4 h-full">

        {/* Panel izquierdo — lista de chats */}
        <div className="w-80 shrink-0 flex flex-col gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">Chats</h1>
            <p className="text-sm text-gray-500">{privados} privados · {grupos} grupos</p>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {chats.map(chat => {
              const nombre   = chat.client_nombre ?? chat.titulo ?? `Chat ${chat.chat_id}`;
              const negativo = (chat.saldo ?? 0) < 0;
              const activo   = selected?.chat_id === chat.chat_id;
              return (
                <button
                  key={chat.chat_id}
                  onClick={() => { setSelected(chat); setLimit(50); }}
                  className={`w-full text-left glass rounded-xl border p-3 flex items-start gap-3 transition-colors cursor-pointer
                    ${activo   ? 'border-accent bg-accent/10'           : ''}
                    ${negativo && !activo ? 'border-red-500/30'         : ''}
                    ${!activo && !negativo ? 'border-border hover:border-gray-600' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold
                    ${chat.is_group ? 'bg-purple-500/20 text-purple-400' : 'bg-accent/20 text-accent'}`}>
                    {chat.is_group ? '👥' : (nombre[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{nombre}</p>
                    <p className="text-[10px] text-gray-500 truncate mt-0.5">
                      {chat.ultimo_texto ?? 'Sin mensajes'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-gray-600">{tiempoRelativo(chat.ultimo_msg_at)}</p>
                    {chat.saldo != null && (
                      <p className={`text-[10px] font-mono font-semibold ${negativo ? 'text-red-400' : 'text-emerald-400'}`}>
                        ${fmt(chat.saldo)}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Panel derecho — conversación */}
        <div className="flex-1 glass rounded-xl border border-border flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-gray-600">
              <div className="text-center">
                <p className="text-4xl mb-3">💬</p>
                <p>Selecciona un chat para ver la conversación</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header del chat */}
              <div className="p-4 border-b border-border flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold
                  ${selected.is_group ? 'bg-purple-500/20 text-purple-400' : 'bg-accent/20 text-accent'}`}>
                  {selected.is_group ? '👥' : ((selected.client_nombre ?? selected.titulo ?? '?')[0]).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">
                    {selected.client_nombre ?? selected.titulo ?? `Chat ${selected.chat_id}`}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    ID: {selected.chat_id}
                    {selected.concepto && ` · ${selected.concepto}`}
                    {selected.saldo != null && (
                      <span className={selected.saldo < 0 ? ' text-red-400' : ' text-emerald-400'}>
                        {' · $'}{fmt(selected.saldo)}
                      </span>
                    )}
                  </p>
                </div>
                <p className="text-xs text-gray-600">{selected.total_msgs} mensajes</p>
              </div>

              {/* Mensajes */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loading ? (
                  <div className="flex-1 flex items-center justify-center text-gray-600 h-full">
                    <p>Cargando mensajes…</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-600">
                    <p>Sin mensajes registrados</p>
                  </div>
                ) : (
                  <>
                    {/* Botón cargar más */}
                    {messages.length >= limit && (
                      <div className="text-center">
                        <button
                          onClick={() => setLimit(l => l + 50)}
                          className="text-xs text-accent hover:underline"
                        >
                          Cargar más mensajes
                        </button>
                      </div>
                    )}

                    {grouped.map(({ date, msgs }) => (
                      <div key={date} className="space-y-2">
                        {/* Separador de fecha */}
                        <div className="flex items-center gap-3 my-3">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-[10px] text-gray-600 shrink-0">
                            {formatMsgDate(msgs[0].created_at)}
                          </span>
                          <div className="flex-1 h-px bg-border" />
                        </div>

                        {msgs.map(msg => {
                          const esBot = msg.es_bot;
                          return (
                            <div
                              key={msg.id}
                              className={`flex ${esBot ? 'justify-start' : 'justify-end'}`}
                            >
                              <div
                                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm
                                  ${esBot
                                    ? 'bg-gray-800 text-gray-200 rounded-tl-sm'
                                    : 'bg-accent/20 text-white rounded-tr-sm border border-accent/30'
                                  }`}
                              >
                                {/* Nombre del remitente en grupos */}
                                {!esBot && msg.from_username && (
                                  <p className="text-[10px] text-accent mb-0.5 font-semibold">
                                    @{msg.from_username}
                                  </p>
                                )}
                                {/* Tipo de mensaje */}
                                {msg.tipo !== 'texto' && (
                                  <p className="text-[10px] text-gray-500 mb-0.5 italic">
                                    [{msg.tipo}{msg.file_name ? `: ${msg.file_name}` : ''}]
                                  </p>
                                )}
                                {/* Texto */}
                                {msg.texto && (
                                  <p className="whitespace-pre-wrap break-words leading-snug">
                                    {msg.texto}
                                  </p>
                                )}
                                <p className={`text-[10px] mt-1 ${esBot ? 'text-gray-600' : 'text-gray-400'} text-right`}>
                                  {formatMsgTime(msg.created_at)}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
