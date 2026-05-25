'use client';
import Link from 'next/link';
import { use } from 'react';
import { ChatWindow } from '@/components/chat/chat-window';

export default function CaseChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <div className="flex h-full flex-col">
      {/* Sub-nav */}
      <div className="flex items-center gap-1 border-b border-border px-4 py-2">
        <Link href="/cases" className="text-xs text-text-faint hover:text-text-muted">
          Expedientes
        </Link>
        <span className="text-text-faint text-xs">/</span>
        <span className="text-xs font-medium text-text-primary truncate max-w-[180px]">{id}</span>
        <div className="flex-1" />
        <nav className="flex gap-1">
          {[
            { label: 'Chat',       href: `/cases/${id}` },
            { label: 'Artefactos', href: `/cases/${id}/artifacts` },
            { label: 'Grafo',      href: `/cases/${id}/graph` },
          ].map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="rounded px-2.5 py-1 text-xs text-text-muted hover:text-text-primary"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatWindow caseId={id} />
      </div>
    </div>
  );
}
