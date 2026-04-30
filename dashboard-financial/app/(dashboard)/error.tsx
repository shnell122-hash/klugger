'use client';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="glass rounded-xl border border-red-700 p-8 max-w-lg w-full text-center space-y-4">
        <h1 className="text-xl font-bold text-white">Error del dashboard</h1>
        <p className="text-sm text-gray-400">{error.message}</p>
        {error.digest && (
          <p className="text-xs text-gray-600 font-mono">Digest: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="mt-4 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-80 transition"
        >
          Reintentar
        </button>
      </div>
    </main>
  );
}
