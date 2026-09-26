import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">404</p>
      <h1 className="mt-2">Page not found</h1>
      <p className="mt-2 text-slate-600">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link to="/" className="btn-primary mt-6">
        Back to home
      </Link>
    </div>
  );
}
