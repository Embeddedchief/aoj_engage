import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="text-5xl font-bold text-navy-100">404</div>
      <h1 className="mt-2 text-lg font-semibold text-navy">Page not found</h1>
      <p className="mt-1 text-sm text-muted">It may have been removed, or you may not have access to it.</p>
      <Link href="/" className="btn-primary mt-6">Back to overview</Link>
    </div>
  );
}
