"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
      <h1 className="text-lg font-semibold text-navy">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">The error has been logged{error.digest ? ` (reference ${error.digest})` : ""}. Try again, and contact the ICT Administrator if it continues.</p>
      <button onClick={reset} className="btn-primary mt-6">Try again</button>
    </div>
  );
}
