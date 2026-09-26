import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { HOME_FOR_ROLE, useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const user = await login(email.trim(), password);
      navigate(next && next.startsWith('/') ? next : HOME_FOR_ROLE[user.role], { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="card">
        <h1>Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">Welcome back — let&apos;s get you to your appointments.</p>

        <form className="mt-6 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          {error && (
            <div role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
              {error}
            </div>
          )}

          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-600">
          New patient?{' '}
          <Link to="/signup" className="font-semibold text-brand-700 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
