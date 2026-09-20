"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const missingDb = /DATABASE_URL|SESSION_SECRET/.test(error.message);
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="card max-w-lg p-8">
        <h1 className="text-lg font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm font-medium text-ink-soft">{error.message || "An unexpected error occurred."}</p>
        {missingDb && (
          <ol className="mt-4 space-y-1.5 rounded-xl bg-canvas p-4 text-sm font-medium">
            <li>1. Copy <code className="font-bold">.env.example</code> to <code className="font-bold">.env</code></li>
            <li>2. Paste your Neon connection string into <code className="font-bold">DATABASE_URL</code></li>
            <li>3. Set a long random <code className="font-bold">SESSION_SECRET</code></li>
            <li>4. Run <code className="font-bold">npm run db:seed</code>, then restart the dev server</li>
          </ol>
        )}
        <button onClick={reset} className="mt-5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-ink hover:bg-brand-600">
          Try again
        </button>
      </div>
    </main>
  );
}
