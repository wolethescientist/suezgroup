import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="card max-w-md p-8 text-center">
        <p className="text-5xl font-bold text-brand-600">404</p>
        <h1 className="mt-3 text-lg font-bold">We could not find that page</h1>
        <p className="mt-1 text-sm font-medium text-ink-soft">
          It may have been archived, or you may not have access to it.
        </p>
        <Link href="/" className="mt-5 inline-flex rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-ink hover:bg-brand-600">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
